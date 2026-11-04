import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ensureCatalog } from './catalog.js';

const MAX_ATTEMPTS = 15;
const RETRY_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: pg.Pool;

  constructor() {
    // Pool próprio: em serverless cada instância deve segurar poucas conexões (DB_POOL_MAX, padrão 5).
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
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
          this.logger.warn('PostgreSQL indisponível. Suba o banco com `docker compose up -d` (ou `docker start zeut-db`). Tentando reconectar…');
        }
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
    }
    throw new Error(
      `Não foi possível conectar ao PostgreSQL após ${MAX_ATTEMPTS} tentativas. ` +
        'Verifique se o banco está rodando e se DATABASE_URL está correto.',
    );
  }
}
