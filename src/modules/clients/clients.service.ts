import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isValidCnpj, isValidCpf, normalizeDocument } from '../../common/document.js';
import { toClient } from '../../common/mappers.js';
import type { Address, Client, ClientType, Contact } from '../../common/types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateClientDto {
  type: ClientType;
  name: string;
  document: string;
  contacts: Contact[];
  address?: Address;
}

const include = { contacts: { orderBy: { position: 'asc' as const } } };

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q?: string): Promise<Client[]> {
    const digits = q ? normalizeDocument(q) : '';
    const rows = await this.prisma.client.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits ? [{ document: { contains: digits } }] : [])] } : undefined,
      include,
      orderBy: { name: 'asc' },
    });
    return rows.map(toClient);
  }

  async get(id: string): Promise<Client> {
    const c = await this.prisma.client.findUnique({ where: { id }, include });
    if (!c) throw new NotFoundException('Cliente não encontrado');
    return toClient(c);
  }

  async create(dto: CreateClientDto): Promise<Client> {
    const errors: string[] = [];
    if (!dto.name?.trim()) errors.push('Nome / Razão social é obrigatório');
    const doc = normalizeDocument(dto.document ?? '');
    if (dto.type === 'PF' ? !isValidCpf(doc) : !isValidCnpj(doc)) {
      errors.push(dto.type === 'PF' ? 'CPF inválido' : 'CNPJ inválido: os dígitos verificadores não conferem');
    }
    if (doc && (await this.prisma.client.findUnique({ where: { document: doc } }))) errors.push('Já existe um cliente com este documento');
    if (!dto.contacts?.length || dto.contacts.some((c) => !c.value?.trim())) errors.push('Informe pelo menos uma forma de contato');
    if (dto.contacts?.some((c) => c.ownerName !== undefined && !c.ownerName.trim())) errors.push('Informe a quem pertence o contato');
    if (errors.length) throw new BadRequestException(errors);

    const created = await this.prisma.client.create({
      data: {
        type: dto.type, name: dto.name.trim(), document: doc,
        address: dto.address ? { ...dto.address } : undefined,
        contacts: {
          create: dto.contacts.map((c, position) => ({
            kind: c.kind, value: c.value.trim(), ownerName: c.ownerName?.trim(), ownerDocument: c.ownerDocument, position,
          })),
        },
      },
      include,
    });
    return toClient(created);
  }
}
