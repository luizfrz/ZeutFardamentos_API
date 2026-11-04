// Cria um usuário direto no banco (útil para o 1º acesso). Uso: yarn user:create [--admin] [--reset]  |  yarn user:create:neon ...
//   --admin  cria como administrador     --reset  se o e-mail já existe, redefine a senha (e o papel, com --admin)
//   --from-admin-file  usa e-mail/senha do .env.admin (gerado para o primeiro administrador)
// Interativo (a senha não aparece na tela) ou por variáveis: NEW_USER_NAME, NEW_USER_EMAIL, NEW_USER_PASSWORD.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import readline from 'node:readline';
import pg from 'pg';

const args = process.argv.slice(2);
const role = args.includes('--admin') || process.env.NEW_USER_ROLE === 'ADMIN' ? 'ADMIN' : 'USER';
const reset = args.includes('--reset');

// --from-admin-file: lê e-mail e senha do .env.admin (sem digitar nem exibir a senha)
if (args.includes('--from-admin-file')) {
  if (!existsSync('.env.admin')) { console.error('✘ .env.admin não encontrado.'); process.exit(1); }
  process.loadEnvFile('.env.admin');
  process.env.NEW_USER_EMAIL ??= process.env.ADMIN_EMAIL;
  process.env.NEW_USER_PASSWORD ??= process.env.ADMIN_PASSWORD;
  process.env.NEW_USER_NAME ??= 'Administrador Zeut';
}

if (!existsSync(new URL('../dist/modules/auth/password.js', import.meta.url))) {
  console.error('✘ Rode `yarn build` antes (o hash de senha vem do código compilado).');
  process.exit(1);
}
const { hashPassword } = await import('../dist/modules/auth/password.js');
if (!process.env.DATABASE_URL) { console.error('✘ DATABASE_URL não definida.'); process.exit(1); }

const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return '(URL inválida)'; } })();

async function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); };
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); }));
}

const name = process.env.NEW_USER_NAME ?? (await ask('Nome: '));
const email = (process.env.NEW_USER_EMAIL ?? (await ask('E-mail: '))).toLowerCase();
const password = process.env.NEW_USER_PASSWORD ?? (await ask('Senha (mín. 8 caracteres): ', { hidden: true }));
if (!process.env.NEW_USER_PASSWORD && password !== (await ask('Repita a senha: ', { hidden: true }))) { console.error('✘ As senhas não conferem.'); process.exit(1); }
if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || password.length < 8) {
  console.error('✘ Dados inválidos (nome ≥ 2, e-mail válido, senha ≥ 8 caracteres).'); process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 15_000 });
try {
  const hash = await hashPassword(password);
  try {
    await pool.query('INSERT INTO "User" (id, name, email, "passwordHash", role) VALUES ($1, $2, $3, $4, $5::"UserRole")', [randomUUID(), name, email, hash, role]);
    console.log(`✔ ${role === 'ADMIN' ? 'Administrador' : 'Usuário'} ${email} criado em ${host}.`);
  } catch (e) {
    if (e.code !== '23505' || !reset) throw e;
    await pool.query(`UPDATE "User" SET "passwordHash" = $1${args.includes('--admin') ? ', role = \'ADMIN\'' : ''} WHERE email = $2`, [hash, email]);
    console.log(`✔ Senha de ${email} redefinida em ${host}.`);
  }
} catch (e) {
  console.error(e.code === '23505' ? `✘ Já existe um usuário com o e-mail ${email} (use --reset para redefinir a senha).` : `✘ ${e.message}`);
  process.exitCode = 1;
} finally { await pool.end(); }
