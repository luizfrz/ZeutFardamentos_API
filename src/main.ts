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
await bootstrap();
