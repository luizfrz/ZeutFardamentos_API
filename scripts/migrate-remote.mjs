// Aplica as migrations no banco REMOTO (Neon) usando .env.neon. Uso: yarn db:migrate:neon
// Proteções: exige URL direta, recusa localhost e pooler, e nunca imprime a senha.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const FILE = '.env.neon';
if (!existsSync(FILE)) { console.error(`✘ ${FILE} não existe.`); process.exit(1); }
process.loadEnvFile(FILE);

const url = process.env.DIRECT_DATABASE_URL;
if (!url) { console.error(`✘ DIRECT_DATABASE_URL está vazia em ${FILE}. Cole a URL direta do Neon (pooling desligado).`); process.exit(1); }

let host;
try { host = new URL(url).hostname; } catch { console.error('✘ DIRECT_DATABASE_URL não é uma URL válida (confira se colou inteira, sem aspas).'); process.exit(1); }
if (/^(localhost|127\.0\.0\.1|::1)$/.test(host)) { console.error('✘ Recusado: o host é local. Este comando é só para o banco remoto.'); process.exit(1); }
if (host.includes('-pooler')) { console.error('✘ Recusado: use a URL DIRETA (sem "-pooler") para migrations. Desligue "Connection pooling" no Neon.'); process.exit(1); }
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('-pooler') && /neon\.tech/.test(process.env.DATABASE_URL)) {
  console.warn('⚠ DATABASE_URL (do .env.neon) não tem "-pooler": na Vercel use a URL COM pooler.');
}

console.log(`→ Aplicando migrations em ${host} …`);
const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log('\n✔ Migrations aplicadas. Conferindo:');
const c = spawnSync('node', ['scripts/check-db.mjs'], { stdio: 'inherit', env: process.env });
process.exit(c.status ?? 0);
