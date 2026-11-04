import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ensureCatalog } from './catalog.js';

// Local: espera o Docker subir (15 × 2 s). Serverless (Vercel): falha rápido — uma requisição não pode ficar
// pendurada por minutos; o Neon "acordado" responde em poucos segundos.
const ON_VERCEL = Boolean(process.env.VERCEL);
const MAX_ATTEMPTS = ON_VERCEL ? 2 : 15;
const RETRY_DELAY_MS = ON_VERCEL ? 500 : 2000;
const CONNECT_TIMEOUT_MS = ON_VERCEL ? 6000 : 15_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: pg.Pool;

  constructor() {
    if (!process.env.DATABASE_URL) {
      // Sem isso o pg tenta o localhost e a requisição fica presa até estourar o tempo.
      throw new Error('DATABASE_URL não definida. Configure a variável de ambiente (na Vercel: Settings → Environment Variables).');
    }
    // Pool próprio: em serverless cada instância deve segurar poucas conexões (DB_POOL_MAX, padrão 5).
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      // Neon/Supabase gratuitos "dormem" quando ociosos: o 1º acesso pode levar alguns segundos para acordar.
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.attachToVercel();
    await this.waitForDatabase();
    await ensureCatalog(this);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end().catch(() => undefined);
  }

  /** Na Vercel (Fluid compute) o pool precisa ser registrado para liberar conexões quando a função é suspensa. */
  private async attachToVercel() {
    if (!process.env.VERCEL) return;
    try {
      const { attachDatabasePool } = await import('@vercel/functions');
      attachDatabasePool(this.pool);
    } catch (e) {
      this.logger.warn(`Não foi possível registrar o pool na Vercel: ${(e as Error).message}`);
    }
  }

  /** Espera o PostgreSQL ficar disponível (ex.: container ainda subindo) em vez de derrubar a API na hora. */
  private async waitForDatabase() {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.$queryRaw`SELECT 1`;
        if (attempt > 1) this.logger.log('Conexão com o PostgreSQL estabelecida.');
        return;
      } catch {
        if (attempt === 1) {
          this.logger.warn(
            ON_VERCEL
              ? 'PostgreSQL indisponível. Confira DATABASE_URL (string do Neon COM -pooler) em Settings → Environment Variables e se o projeto Neon está ativo.'
              : 'PostgreSQL indisponível. Suba o banco com `docker compose up -d` (ou `docker start zeut-db`). Tentando reconectar…',
          );
        }
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
    }
    throw new Error(
      `Não foi possível conectar ao PostgreSQL após ${MAX_ATTEMPTS} tentativas. ` +
        (ON_VERCEL
          ? 'Confira DATABASE_URL nas variáveis de ambiente da Vercel e se o projeto Neon está ativo.'
          : 'Verifique se o banco está rodando e se DATABASE_URL está correto.'),
    );
  }
}
