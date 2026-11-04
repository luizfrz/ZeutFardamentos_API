import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ensureCatalog } from './catalog.js';

const MAX_ATTEMPTS = 15;
const RETRY_DELAY_MS = 2000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.waitForDatabase();
    await ensureCatalog(this);
  }

  onModuleDestroy() {
    return this.$disconnect();
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
        'Verifique se o banco está rodando (`docker compose up -d`) e se DATABASE_URL no .env está correto.',
    );
  }
}
