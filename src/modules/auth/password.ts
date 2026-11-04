import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

type ScryptFn = (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;
const scrypt = promisify(scryptCb) as unknown as ScryptFn;

// Parâmetros do scrypt (OWASP recomenda N=2^17; 2^15 equilibra segurança e tempo de partida a frio em serverless).
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

const normalize = (password: string) => password.normalize('NFKC');

/** Formato: scrypt$N$r$p$salt(base64)$hash(base64) — os parâmetros ficam no hash, então dá para evoluí-los depois. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(normalize(password), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(normalize(password), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | undefined;
/** Hash descartável: gasta o mesmo tempo quando o e-mail não existe, para não revelar quais e-mails têm conta. */
export const dummyHash = () => (dummy ??= hashPassword(randomBytes(12).toString('hex')));
