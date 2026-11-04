import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EMAIL_RE, type Role } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';

export interface UserView { id: string; name: string; email: string; role: Role; createdAt: Date; lastLoginAt: Date | null }
const select = { id: true, name: true, email: true, role: true, createdAt: true, lastLoginAt: true } as const;

function validPassword(password: string | undefined): string[] {
  const p = password ?? '';
  return [...(p.length < 8 ? ['A senha deve ter pelo menos 8 caracteres.'] : []), ...(p.length > 128 ? ['A senha deve ter no máximo 128 caracteres.'] : [])];
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<UserView[]> {
    return this.prisma.user.findMany({ select, orderBy: [{ role: 'asc' }, { name: 'asc' }] }) as Promise<UserView[]>;
  }

  async create(body: { name?: string; email?: string; password?: string; role?: string }): Promise<UserView> {
    const name = (body.name ?? '').trim();
    const email = (body.email ?? '').trim().toLowerCase();
    const errors: string[] = [];
    if (name.length < 2 || name.length > 80) errors.push('Informe o nome (2 a 80 caracteres).');
    if (!EMAIL_RE.test(email) || email.length > 160) errors.push('Informe um e-mail válido.');
    errors.push(...validPassword(body.password));
    if (body.role !== undefined && body.role !== 'ADMIN' && body.role !== 'USER') errors.push('Papel inválido.');
    if (errors.length) throw new BadRequestException(errors);
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException({ message: 'Já existe uma conta com este e-mail.', code: 'EMAIL_TAKEN' });
    return this.prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(body.password!), role: body.role === 'ADMIN' ? 'ADMIN' : 'USER' },
      select,
    }) as Promise<UserView>;
  }

  /** Redefine senha e/ou muda o papel. Nunca deixa o sistema sem administrador. */
  async update(id: string, body: { password?: string; role?: string }): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    const data: { passwordHash?: string; role?: 'ADMIN' | 'USER' } = {};
    if (body.password !== undefined) {
      const errors = validPassword(body.password);
      if (errors.length) throw new BadRequestException(errors);
      data.passwordHash = await hashPassword(body.password);
    }
    if (body.role !== undefined) {
      if (body.role !== 'ADMIN' && body.role !== 'USER') throw new BadRequestException(['Papel inválido.']);
      if (user.role === 'ADMIN' && body.role === 'USER') await this.assertNotLastAdmin();
      data.role = body.role;
    }
    if (!Object.keys(data).length) throw new BadRequestException(['Nada para alterar.']);
    return this.prisma.user.update({ where: { id }, data, select }) as Promise<UserView>;
  }

  async remove(id: string, actorId: string): Promise<{ id: string }> {
    if (id === actorId) throw new BadRequestException(['Você não pode excluir a própria conta.']);
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.role === 'ADMIN') await this.assertNotLastAdmin();
    await this.prisma.user.delete({ where: { id } });
    return { id };
  }

  private async assertNotLastAdmin() {
    if ((await this.prisma.user.count({ where: { role: 'ADMIN' } })) <= 1) {
      throw new BadRequestException(['O sistema precisa ter pelo menos um administrador.']);
    }
  }
}
