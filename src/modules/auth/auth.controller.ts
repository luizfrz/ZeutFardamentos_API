import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { AuthedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

type Req2 = AuthedRequest & { ip?: string };
/** IP do cliente (a Vercel envia em x-forwarded-for). */
const clientIp = (req: Req2) => (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.ip || 'unknown';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public() @Post('login') @HttpCode(200)
  login(@Body() body: { email?: string; password?: string }, @Req() req: Req2) { return this.service.login(body, clientIp(req)); }

  /** Usuário da sessão atual (valida o token). */
  @Get('me')
  me(@Req() req: AuthedRequest) { return req.user; }
}
