// Valida a conexão com o banco ANTES do deploy: node scripts/check-db.mjs  (ou: yarn db:check)
// Lê DATABASE_URL (e DIRECT_DATABASE_URL, se existir) do ambiente/.env. Nunca imprime senha.
import 'dotenv/config';
import pg from 'pg';

const mask = (url) => { try { const u = new URL(url); return `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)}`; } catch { return '(URL inválida)'; } };

async function check(label, url) {
  if (!url) return console.log(`– ${label}: não definida`);
  const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000 });
  const t0 = Date.now();
  try {
    const { rows: [v] } = await pool.query('SELECT version() AS v, current_database() AS db');
    const ms = Date.now() - t0;
    const { rows: [m] } = await pool.query(`SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS has`);
    let applied = '—';
    if (m.has) applied = (await pool.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n + ' migration(s) aplicada(s)';
    console.log(`✔ ${label}: ${mask(url)}  (${ms} ms, ${v.v.split(' ').slice(0, 2).join(' ')})  ${m.has ? applied : 'schema ainda NÃO criado → rode: yarn db:deploy'}`);
    if (/-pooler|pooler\.supabase|:6543/.test(url)) console.log(`   ↳ ${label} usa pooler`);
    else if (label === 'DATABASE_URL' && /neon\.tech/.test(url)) console.log('   ⚠ DATABASE_URL do Neon sem "-pooler" no host: em produção use a URL com pooler.');
  } catch (e) {
    const why = e.message || e.code || e.errors?.map((x) => x.code).filter(Boolean).join(', ') || 'falha ao conectar';
    console.log(`✘ ${label}: ${mask(url)}  →  ${why}${/ECONNREFUSED/.test(why) ? ' (banco desligado ou porta errada)' : ''}`);
    process.exitCode = 1;
  } finally { await pool.end().catch(() => {}); }
}

await check('DATABASE_URL', process.env.DATABASE_URL);
await check('DIRECT_DATABASE_URL', process.env.DIRECT_DATABASE_URL);
