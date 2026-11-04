import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // WEB_ORIGIN aceita várias origens separadas por vírgula (produção + previews).
  const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins });
  await app.listen(process.env.PORT ?? 3333);
}
try {
  await bootstrap();
} catch (e) {
  // Garante que a causa real apareça nos logs (Vercel → Logs), em vez de só "500".
  console.error('[bootstrap] falha ao iniciar a API:', e instanceof Error ? (e.stack ?? e.message) : e);
  throw e;
}
