import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3333);
}
try {
  await bootstrap();
} catch (e) {
  // Garante que a causa real apareça nos logs, em vez de só "500".
  console.error('[bootstrap] falha ao iniciar a API:', e instanceof Error ? (e.stack ?? e.message) : e);
  throw e;
}
