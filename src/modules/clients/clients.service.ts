import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isValidCnpj, isValidCpf, normalizeDocument } from '../../common/document.js';
import { toClient } from '../../common/mappers.js';
import type { Address, Client, ClientType, Contact } from '../../common/types.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateClientDto {
  type: ClientType;
  name: string;
  /** CPF (opcional, pessoa física) ou CNPJ (obrigatório para empresa e órgão público). */
  document?: string;
  contacts: Contact[];
  address?: Address;
}

const include = { contacts: { orderBy: { position: 'asc' as const } } };
// A lista também traz os nomes dos pedidos vinculados (usados no aviso de exclusão).
const orderRef = { select: { id: true, name: true }, orderBy: { createdAt: 'desc' as const } };
const includeOrders = { ...include, orders: orderRef, extraOrders: orderRef };

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q?: string): Promise<Client[]> {
    const digits = q ? normalizeDocument(q) : '';
    const rows = await this.prisma.client.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits ? [{ document: { contains: digits } }] : [])] } : undefined,
      include: includeOrders,
      orderBy: { name: 'asc' },
    });
    return rows.map(({ orders, extraOrders, ...r }) => ({ ...toClient(r), orders: [...orders, ...extraOrders] }));
  }

  async get(id: string): Promise<Client> {
    const c = await this.prisma.client.findUnique({ where: { id }, include });
    if (!c) throw new NotFoundException('Cliente não encontrado');
    return toClient(c);
  }

  private async validate(dto: CreateClientDto, selfId?: string) {
    const errors: string[] = [];
    if (!dto.name?.trim()) errors.push('Nome / Razão social é obrigatório');
    const doc = normalizeDocument(dto.document ?? '');
    if (dto.type === 'PF') {
      if (doc && !isValidCpf(doc)) errors.push('CPF inválido');
    } else if (!doc) {
      errors.push('CNPJ é obrigatório para empresa e órgão público');
    } else if (!isValidCnpj(doc)) {
      errors.push('CNPJ inválido: os dígitos verificadores não conferem');
    }
    const same = doc ? await this.prisma.client.findUnique({ where: { document: doc } }) : null;
    if (same && same.id !== selfId) errors.push('Já existe um cliente com este documento');
    if (!dto.contacts?.length || dto.contacts.some((c) => !c.value?.trim())) errors.push('Informe pelo menos uma forma de contato');
    if (dto.contacts?.some((c) => c.ownerName !== undefined && !c.ownerName.trim())) errors.push('Informe a quem pertence o contato');
    if (errors.length) throw new BadRequestException(errors);
    return doc;
  }

  async create(dto: CreateClientDto): Promise<Client> {
    const doc = await this.validate(dto);
    const created = await this.prisma.client.create({
      data: {
        type: dto.type, name: dto.name.trim(), document: doc || null,
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

  /** Substitui os dados do cliente (inclusive contatos e endereço). */
  async update(id: string, dto: CreateClientDto): Promise<Client> {
    if (!(await this.prisma.client.count({ where: { id } }))) throw new NotFoundException('Cliente não encontrado');
    const doc = await this.validate(dto, id);
    const filled = dto.address && Object.values(dto.address).some((v) => typeof v === 'string' && v.trim());
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.contact.deleteMany({ where: { clientId: id } });
      return tx.client.update({
        where: { id },
        data: {
          type: dto.type, name: dto.name.trim(), document: doc || null,
          address: filled ? { ...dto.address } : Prisma.DbNull,
          contacts: {
            create: dto.contacts.map((c, position) => ({
              kind: c.kind, value: c.value.trim(), ownerName: c.ownerName?.trim(), ownerDocument: c.ownerDocument, position,
            })),
          },
        },
        include,
      });
    });
    return toClient(updated);
  }

  /** Cliente com pedidos não pode ser apagado (Restrict no banco); os contatos saem junto. */
  async remove(id: string) {
    if (!(await this.prisma.client.count({ where: { id } }))) throw new NotFoundException('Cliente não encontrado');
    const orders = await this.prisma.order.findMany({ where: { OR: [{ clientId: id }, { extraClients: { some: { id } } }] }, select: { name: true } });
    if (orders.length) throw new BadRequestException(`Este cliente tem ${orders.length === 1 ? 'um pedido vinculado' : 'pedidos vinculados'}: ${orders.map((o) => o.name).join(', ')}. Exclua ${orders.length === 1 ? 'o pedido' : 'os pedidos'} antes de apagar o cliente.`);
    await this.prisma.client.delete({ where: { id } });
    return { id };
  }

  /** Endereço é opcional: sem `address` (ou vazio), o endereço é removido. */
  async setAddress(id: string, address?: Address): Promise<Client> {
    if (!(await this.prisma.client.count({ where: { id } }))) throw new NotFoundException('Cliente não encontrado');
    const filled = address && Object.values(address).some((v) => typeof v === 'string' && v.trim());
    const c = await this.prisma.client.update({
      where: { id }, data: { address: filled ? { ...address } : Prisma.DbNull }, include,
    });
    return toClient(c);
  }
}
