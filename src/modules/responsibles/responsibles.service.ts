import { BadRequestException, Injectable } from '@nestjs/common';
import { isValidCpf, isValidPhone, normalizeDocument } from '../../common/document.js';
import { toResponsible } from '../../common/mappers.js';
import type { Responsible } from '../../common/types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ResponsiblesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q?: string): Promise<Responsible[]> {
    const d = q ? normalizeDocument(q) : '';
    const rows = await this.prisma.responsible.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(d ? [{ cpf: { contains: d } }] : [])] } : undefined,
      orderBy: { name: 'asc' },
    });
    return rows.map(toResponsible);
  }

  async create(dto: { name: string; cpf?: string; phone: string }): Promise<Responsible> {
    const cpf = normalizeDocument(dto.cpf ?? '');
    const errors: string[] = [];
    if (!dto.name?.trim()) errors.push('Nome é obrigatório');
    if (cpf) {
      if (!isValidCpf(cpf)) errors.push('CPF inválido');
      else if (await this.prisma.responsible.findUnique({ where: { cpf } })) errors.push('Já existe um responsável com este CPF');
    }
    if (!dto.phone?.trim()) errors.push('Telefone é obrigatório');
    else if (!isValidPhone(dto.phone)) errors.push('Telefone inválido: informe DDD + número');
    if (errors.length) throw new BadRequestException(errors);
    return toResponsible(await this.prisma.responsible.create({ data: { name: dto.name.trim(), cpf: cpf || null, phone: dto.phone.trim() } }));
  }
}
