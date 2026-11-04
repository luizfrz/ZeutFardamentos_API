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

/** O Prisma embrulha o erro do driver (P2010 etc.): extrai a causa real sem imprimir a URL de conexão. */
function describeError(e: unknown): string {
  const err = e as { code?: string; name?: string; message?: string; meta?: unknown; cause?: { code?: string; message?: string; name?: string } };
  const parts = [err.code ?? err.name ?? 'erro'];
  if (err.message) parts.push(err.message.split('\n')[0].slice(0, 200));
  if (err.cause) parts.push(`causa: ${err.cause.code ?? err.cause.name ?? ''} ${err.cause.message ?? ''}`.trim());
  if (err.meta) parts.push(`meta: ${JSON.stringify(err.meta).slice(0, 300)}`);
  return parts.join(' | ');
}

/** Classe curta e sem segredos do erro, segura para expor no /api/health. */
export function classifyError(e: unknown): string {
  const err = e as { message?: string; meta?: { driverAdapterError?: { cause?: { kind?: string; originalCode?: string } } } };
  if (err?.message?.startsWith('DATABASE_URL não definida')) return 'DATABASE_URL_MISSING';
  const cause = err?.meta?.driverAdapterError?.cause;
  if (cause?.kind === 'AuthenticationFailed' || cause?.originalCode === '28P01') return 'DB_AUTH_FAILED';
  if (cause?.kind === 'DatabaseNotReachable') return 'DB_UNREACHABLE';
  if (/Não foi possível conectar ao PostgreSQL/.test(err?.message ?? '')) return 'DB_UNREACHABLE';
  return 'DB_ERROR';
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: pg.Pool;
  /** Motivo (sem dados sensíveis) pelo qual o banco não ficou pronto; usado pelo /api/health. */
  dbProblem: string | null = null;

  constructor() {
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
    try {
      if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL não definida. Configure a variável de ambiente (na Vercel: Settings → Environment Variables).');
      }
      await this.waitForDatabase();
      await ensureCatalog(this);
    } catch (e) {
      this.dbProblem = classifyError(e);
      this.logger.error(`Banco não ficou pronto (${this.dbProblem}): ${describeError(e)}`);
      // Local: falha ao iniciar, como antes. Serverless: a API sobe mesmo assim, para /api/ping e /api/health
      // conseguirem dizer o que está errado (em vez de a função morrer sem resposta).
      if (!ON_VERCEL) throw e;
    }
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
      } catch (e) {
        this.logger.warn(`Tentativa ${attempt}/${MAX_ATTEMPTS} falhou: ${describeError(e)}`);
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
