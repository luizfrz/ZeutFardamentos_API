import { BadRequestException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { PrismaService } from '../../prisma/prisma.service.js';
import { dummyHash, verifyPassword } from './password.js';
import { AttemptLimiter } from './rate-limit.js';

export type Role = 'ADMIN' | 'USER';
export interface AuthUser { id: string; name: string; email: string; role: Role }
export interface AuthResult { token: string; expiresAt: string; user: AuthUser }

const ISSUER = 'zeut-api';
const AUDIENCE = 'zeut-web';
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// 5 erros por IP+e-mail a cada 15 min (por instância).
const loginLimiter = new AttemptLimiter(5, 15 * 60_000);
const tooMany = (seconds: number) =>
  new HttpException({ message: `Muitas tentativas. Tente novamente em ${Math.ceil(seconds / 60)} min.`, retryAfter: seconds }, 429);
const asRole = (v: unknown): Role => (v === 'ADMIN' ? 'ADMIN' : 'USER');

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** null = não configurado (a API recusa tudo em vez de aceitar tokens fracos). */
  private secret(): Uint8Array | null {
    const s = process.env.JWT_SECRET;
    return s && s.length >= 32 ? new TextEncoder().encode(s) : null;
  }

  private notConfigured() {
    return new HttpException({ message: 'Autenticação não configurada no servidor.', code: 'AUTH_NOT_CONFIGURED' }, 503);
  }

  private async issue(user: AuthUser): Promise<AuthResult> {
    const secret = this.secret();
    if (!secret) throw this.notConfigured();
    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = await new SignJWT({ name: user.name, email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id).setIssuer(ISSUER).setAudience(AUDIENCE)
      .setIssuedAt().setExpirationTime(exp)
      .sign(secret);
    return { token, expiresAt: new Date(exp * 1000).toISOString(), user };
  }

  /** Valida o token e devolve o usuário; lança 401/503. */
  async verify(token: string): Promise<AuthUser> {
    const secret = this.secret();
    if (!secret) throw this.notConfigured();
    try {
      const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
      return { id: String(payload.sub), name: String(payload.name ?? ''), email: String(payload.email ?? ''), role: asRole(payload.role) };
    } catch {
      throw new UnauthorizedException({ message: 'Sessão inválida ou expirada.', code: 'UNAUTHORIZED' });
    }
  }

  /** Papel atual no banco (null se o usuário foi removido): rotas de admin não confiam só no token. */
  async currentRole(userId: string): Promise<Role | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return u ? asRole(u.role) : null;
  }

  async login(body: { email?: string; password?: string }, ip: string): Promise<AuthResult> {
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (!EMAIL_RE.test(email) || !password || password.length > 200) throw new BadRequestException(['Informe e-mail e senha.']);

    const key = `${ip}|${email}`;
    const wait = loginLimiter.retryAfter(key);
    if (wait) throw tooMany(wait);

    const user = await this.prisma.user.findUnique({ where: { email } });
    // Sempre gasta o mesmo tempo, exista o e-mail ou não.
    const ok = await verifyPassword(password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok) {
      loginLimiter.fail(key);
      await new Promise((r) => setTimeout(r, 250));
      throw new UnauthorizedException({ message: 'E-mail ou senha incorretos.', code: 'INVALID_CREDENTIALS' });
    }
    loginLimiter.clear(key);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issue({ id: user.id, name: user.name, email: user.email, role: asRole(user.role) });
  }
}
