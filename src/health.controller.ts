import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { classifyError, PrismaService } from './prisma/prisma.service.js';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Não toca no banco: prova que a função NestJS subiu. Só mostra se as variáveis existem (nunca os valores). */
  @Get('ping')
  ping() {
    return {
      ok: true,
      node: process.version,
      vercel: Boolean(process.env.VERCEL),
      region: process.env.VERCEL_REGION ?? null,
      env: { DATABASE_URL: Boolean(process.env.DATABASE_URL), WEB_ORIGIN: Boolean(process.env.WEB_ORIGIN) },
      database: this.prisma.dbProblem ?? 'ok',
    };
  }

  /** Liveness + acesso ao banco. Em caso de erro, devolve a classe do problema (sem detalhes sensíveis). */
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (e) {
      throw new ServiceUnavailableException({ status: 'error', reason: this.prisma.dbProblem ?? classifyError(e) });
    }
  }
}
