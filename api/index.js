// Ponto de entrada da função serverless (Vercel). O Nest é iniciado uma única vez por instância e reaproveitado.
import { createHandler } from '../dist/serverless.js';

let handlerPromise;

export default async function handler(req, res) {
  try {
    handlerPromise ??= createHandler();
    const app = await handlerPromise;
    return app(req, res);
  } catch (e) {
    handlerPromise = undefined; // permite nova tentativa na próxima requisição
    console.error('[function] falha ao iniciar a API:', e instanceof Error ? (e.stack ?? e.message) : e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    // Só o tipo e o começo da mensagem — nunca stack, URLs ou variáveis.
    res.end(JSON.stringify({ error: 'BOOTSTRAP_FAILED', name: e?.name ?? 'Error', message: String(e?.message ?? '').split('\n')[0].slice(0, 160) }));
  }
}
