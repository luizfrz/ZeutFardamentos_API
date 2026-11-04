import type { INestApplication } from '@nestjs/common';

/** Configuração comum da API (usada pelo servidor local e pela função da Vercel). */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  // WEB_ORIGIN aceita várias origens separadas por vírgula (produção + previews).
  // Normaliza: remove espaços e barras finais (o navegador nunca envia a origem com "/" no fim).
  const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  app.enableCors({ origin: origins });
}
