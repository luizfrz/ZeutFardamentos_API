import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { computePriority, daysUntil, deadlineLevel, isRealDate, PRIORITY_RANK } from '../../common/priority.js';
import { toClient, toDbDate, toOrder, toResponsible } from '../../common/mappers.js';
import type { Order, OrderItem, OrderStatus, Priority } from '../../common/types.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface OrderQuery {
  q?: string;
  priority?: Priority;
  status?: 'PENDENTES' | OrderStatus;
  deadline?: 'ALL' | '7' | '14' | 'LATE';
  sort?: 'priority' | 'deadline' | 'quantity';
}

export type OrderInput = Omit<Order, 'id' | 'number' | 'createdAt' | 'status' | 'deliveredAt'> & {
  status?: OrderStatus;
  /** Confirmação explícita de que a data de entrega pode estar no passado. */
  allowPastDate?: boolean;
};

export const itemPieces = (i: OrderItem) =>
  i.grids ? i.grids.reduce((s, g) => s + Object.values(g.quantities).reduce((a, b) => a + (b || 0), 0), 0) : (i.quantity ?? 0);

const include = {
  items: { orderBy: { position: 'asc' as const } },
  client: { include: { contacts: { orderBy: { position: 'asc' as const } } } },
  responsible: true,
};
type OrderRow = Prisma.OrderGetPayload<{ include: typeof include }>;

const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private view(row: OrderRow) {
    const o = toOrder(row);
    const pieces = o.items.reduce((s, i) => s + itemPieces(i), 0);
    const daysLeft = daysUntil(o.deliveryDate);
    return {
      ...o,
      totalPieces: pieces,
      daysLeft,
      deadlineLevel: deadlineLevel(daysLeft),
      priority: computePriority(daysLeft, pieces),
      client: toClient(row.client),
      responsible: toResponsible(row.responsible),
    };
  }

  private async all() {
    return (await this.prisma.order.findMany({ include })).map((r) => this.view(r));
  }

  async list(query: OrderQuery) {
    let rows = await this.all();
    const status = query.status ?? 'PENDENTES';
    rows = rows.filter((o) => (status === 'PENDENTES' ? o.status !== 'CONCLUIDO' : o.status === status));
    if (query.priority) rows = rows.filter((o) => o.priority === query.priority);
    if (query.deadline === '7') rows = rows.filter((o) => o.daysLeft <= 7);
    if (query.deadline === '14') rows = rows.filter((o) => o.daysLeft <= 14);
    if (query.deadline === 'LATE') rows = rows.filter((o) => o.daysLeft < 0);
    if (query.q) {
      const t = query.q.toLowerCase();
      const d = query.q.replace(/\D/g, '');
      rows = rows.filter(
        (o) =>
          o.name.toLowerCase().includes(t) ||
          `#${o.number}`.includes(t) ||
          o.client.name.toLowerCase().includes(t) ||
          o.responsible.name.toLowerCase().includes(t) ||
          (d && (o.client.document?.includes(d) || o.responsible.cpf?.includes(d))),
      );
    }
    const sort = query.sort ?? 'priority';
    rows.sort((a, b) =>
      sort === 'deadline' ? a.daysLeft - b.daysLeft
      : sort === 'quantity' ? b.totalPieces - a.totalPieces
      : PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.totalPieces - a.totalPieces || a.daysLeft - b.daysLeft,
    );
    return status === 'CONCLUIDO' ? rows.sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '')) : rows;
  }

  async summary() {
    const all = await this.all();
    const pending = all.filter((o) => o.status !== 'CONCLUIDO');
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      pending: pending.length,
      urgent: pending.filter((o) => o.priority === 'URGENTE').length,
      dueIn7Days: pending.filter((o) => o.daysLeft >= 0 && o.daysLeft <= 7).length,
      deliveredThisMonth: all.filter((o) => o.deliveredAt?.startsWith(month)).length,
    };
  }

  async get(id: string) {
    const o = await this.prisma.order.findUnique({ where: { id }, include });
    if (!o) throw new NotFoundException('Pedido não encontrado');
    return this.view(o);
  }

  private async validate(dto: Partial<OrderInput>, checkPast: boolean) {
    const errors: string[] = [];
    if (!dto.name?.trim()) errors.push('Campo obrigatório: dê um nome para identificar o pedido');
    if (!dto.clientId || !(await this.prisma.client.count({ where: { id: dto.clientId } }))) errors.push('Cliente vinculado é obrigatório');
    if (!dto.responsibleId || !(await this.prisma.responsible.count({ where: { id: dto.responsibleId } }))) errors.push('Responsável vinculado é obrigatório');
    if (!dto.deliveryDate) errors.push('Data de entrega é obrigatória');
    else if (!isRealDate(dto.deliveryDate)) errors.push('Data de entrega inválida');
    else if (checkPast && daysUntil(dto.deliveryDate) < 0) {
      errors.push('A data de entrega já passou. Confirme o cadastro para registrar uma data no passado.');
    }
    if (!dto.items?.length || dto.items.reduce((s, i) => s + itemPieces(i), 0) <= 0) errors.push('Adicione ao menos um produto com quantidade');
    const moldIds = [...new Set((dto.items ?? []).map((i) => i.moldId))];
    const found = await this.prisma.mold.findMany({ where: { id: { in: moldIds } }, select: { id: true } });
    for (const id of moldIds.filter((m) => !found.some((f) => f.id === m))) errors.push(`Molde inválido: ${id}`);
    if (errors.length) throw new BadRequestException(errors);
  }

  private itemsData(items: OrderItem[]) {
    return items.map((i, position) => ({
      moldId: i.moldId, model: i.model, color: i.color, quantity: i.quantity, position,
      grids: i.grids ? (i.grids as unknown as Prisma.InputJsonValue) : undefined,
    }));
  }

  async create(dto: OrderInput) {
    await this.validate(dto, !dto.allowPastDate);
    const created = await this.prisma.order.create({
      data: {
        name: dto.name.trim(), description: dto.description, clientId: dto.clientId, responsibleId: dto.responsibleId,
        deliveryDate: toDbDate(dto.deliveryDate), links: (dto.links ?? []) as unknown as Prisma.InputJsonValue, images: dto.images ?? [],
        items: { create: this.itemsData(dto.items) },
      },
      include,
    });
    return this.view(created);
  }

  async update(id: string, dto: Partial<OrderInput>) {
    const current = await this.prisma.order.findUnique({ where: { id }, include });
    if (!current) throw new NotFoundException('Pedido não encontrado');
    const { allowPastDate, ...changes } = dto;
    const base = toOrder(current);
    const dateChanged = changes.deliveryDate !== undefined && changes.deliveryDate !== base.deliveryDate;
    await this.validate({ ...base, ...changes }, dateChanged && !allowPastDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (changes.items) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({ data: this.itemsData(changes.items).map((i) => ({ ...i, orderId: id })) });
      }
      return tx.order.update({
        where: { id },
        data: {
          name: changes.name?.trim(), description: changes.description, clientId: changes.clientId, responsibleId: changes.responsibleId,
          deliveryDate: changes.deliveryDate ? toDbDate(changes.deliveryDate) : undefined,
          links: changes.links ? (changes.links as unknown as Prisma.InputJsonValue) : undefined, images: changes.images,
        },
        include,
      });
    });
    return this.view(updated);
  }

  async setStatus(id: string, status: OrderStatus) {
    if (!['NAO_INICIADO', 'PENDENTE', 'CONCLUIDO'].includes(status)) throw new BadRequestException('Status inválido');
    if (!(await this.prisma.order.count({ where: { id } }))) throw new NotFoundException('Pedido não encontrado');
    const o = await this.prisma.order.update({
      where: { id }, data: { status, deliveredAt: status === 'CONCLUIDO' ? today() : null }, include,
    });
    return this.view(o);
  }
}
