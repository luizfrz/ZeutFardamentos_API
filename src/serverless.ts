import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** Inicia o Nest SEM abrir porta e devolve o handler HTTP (Express) para a função serverless. */
export async function createHandler(): Promise<Handler> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}
