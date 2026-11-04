import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService, type AuthUser, type Role } from './auth.service.js';
import { IS_PUBLIC } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';

export type AuthedRequest = { headers: Record<string, string | undefined>; user?: AuthUser };

/** Guard global: toda rota exige `Authorization: Bearer <token>`, exceto as marcadas com @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException({ message: 'Faça login para continuar.', code: 'UNAUTHORIZED' });
    }
    const user = await this.auth.verify(token);

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length) {
      const role = await this.auth.currentRole(user.id);
      if (!role) throw new UnauthorizedException({ message: 'Sessão inválida ou expirada.', code: 'UNAUTHORIZED' });
      if (!roles.includes(role)) throw new ForbiddenException({ message: 'Apenas administradores podem fazer isso.', code: 'FORBIDDEN' });
      user.role = role;
    }
    req.user = user;
    return true;
  }
}
