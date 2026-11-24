import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { computePriority, daysUntil, isRealDate, PRIORITY_RANK } from '../../common/priority.js';
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

export type OrderInput = Omit<Order, 'id' | 'number' | 'createdAt' | 'status' | 'deliveredAt' | 'stages' | 'clientId' | 'responsibleId'> & {
  status?: OrderStatus;
  /** Vínculos: o primeiro é o principal. `clientId`/`responsibleId` (um só) continuam aceitos. */
  clientIds?: string[];
  responsibleIds?: string[];
  clientId?: string;
  responsibleId?: string;
  /** Confirmação explícita de que a data de entrega pode estar no passado. */
  allowPastDate?: boolean;
};

export const itemPieces = (i: OrderItem) =>
  i.grids ? i.grids.reduce((s, g) => s + Object.values(g.quantities).reduce((a, b) => a + (b || 0), 0), 0) : (i.quantity ?? 0);

const contacts = { contacts: { orderBy: { position: 'asc' as const } } };
const include = {
  items: { orderBy: { position: 'asc' as const } },
  payments: { orderBy: [{ paidAt: 'asc' as const }, { createdAt: 'asc' as const }] },
  client: { include: contacts },
  extraClients: { include: contacts },
  responsible: true,
  extraResponsibles: true,
};
type OrderRow = Prisma.OrderGetPayload<{ include: typeof include }>;

const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);

/** Endereço público de um arquivo do Vercel Blob (https://<loja>.public.blob.vercel-storage.com/...). */
const isBlobUrl = (u: unknown): boolean => {
  if (typeof u !== 'string' || u.length > 500) return false;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname.endsWith('.public.blob.vercel-storage.com');
  } catch {
    return false;
  }
};

/** Etapas de produção, na ordem. */
export const STAGES = ['ARQUIVO', 'ENVIO_IMPRESSAO', 'IMPRESSAO', 'SUBLIMADO', 'CORTE', 'COSTURA', 'EMPACOTADO', 'ENTREGUE'];

const NO_DEADLINE_DAYS = 9999;

/** Normaliza os vínculos: aceita listas ou um id só, sem repetidos. */
const links = (d: Partial<OrderInput>) => ({
  clientIds: [...new Set(d.clientIds?.length ? d.clientIds : d.clientId ? [d.clientId] : [])],
  responsibleIds: [...new Set(d.responsibleIds?.length ? d.responsibleIds : d.responsibleId ? [d.responsibleId] : [])],
});

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private view(row: OrderRow) {
    const o = toOrder(row);
    const pieces = o.items.reduce((s, i) => s + itemPieces(i), 0);
    // shortcut: sem prazo vira 9999 dias (BAIXA, nunca atrasado); trocar por daysLeft nulo se a UI precisar distinguir
    const daysLeft = o.deliveryDate ? daysUntil(o.deliveryDate) : NO_DEADLINE_DAYS;
    const payments = row.payments.map((p) => ({ id: p.id, amount: p.amount, paidAt: p.paidAt.toISOString().slice(0, 10) }));
    const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
    return {
      ...o,
      payments,
      paidTotal,
      paymentStatus: o.totalValue ? (paidTotal >= o.totalValue ? 'PAGO' : 'PENDENTE') : undefined,
      totalPieces: pieces,
      daysLeft,
      priority: computePriority(daysLeft),
      client: toClient(row.client),
      responsible: toResponsible(row.responsible),
      clients: [row.client, ...row.extraClients].map(toClient),
      responsibles: [row.responsible, ...row.extraResponsibles].map(toResponsible),
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
          o.clients.some((c) => c.name.toLowerCase().includes(t) || (d && c.document?.includes(d))) ||
          o.responsibles.some((r) => r.name.toLowerCase().includes(t) || (d && r.cpf?.includes(d))),
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
    const { clientIds, responsibleIds } = links(dto);
    if (!clientIds.length || (await this.prisma.client.count({ where: { id: { in: clientIds } } })) !== clientIds.length) errors.push('Cliente vinculado é obrigatório');
    if (!responsibleIds.length || (await this.prisma.responsible.count({ where: { id: { in: responsibleIds } } })) !== responsibleIds.length) errors.push('Responsável vinculado é obrigatório');
    if (dto.deliveryDate) {
      if (!isRealDate(dto.deliveryDate)) errors.push('Data de entrega inválida');
      else if (checkPast && daysUntil(dto.deliveryDate) < 0) {
        errors.push('A data de entrega já passou. Confirme o cadastro para registrar uma data no passado.');
      }
    }
    if (!dto.items?.length || dto.items.reduce((s, i) => s + itemPieces(i), 0) <= 0) errors.push('Adicione ao menos um produto com quantidade');
    const moldIds = [...new Set((dto.items ?? []).map((i) => i.moldId))];
    const found = await this.prisma.mold.findMany({ where: { id: { in: moldIds } }, select: { id: true } });
    for (const id of moldIds.filter((m) => !found.some((f) => f.id === m))) errors.push(`Molde inválido: ${id}`);
    // Fotos: só endereços https do Vercel Blob (o valor vira src/href no site; nada de javascript: ou sites de terceiros)
    if (dto.images !== undefined) {
      if (!Array.isArray(dto.images) || dto.images.length > 8) errors.push('Envie no máximo 8 imagens');
      else if (!dto.images.every(isBlobUrl)) errors.push('Endereço de imagem inválido');
    }
    if (dto.totalValue != null && !(Number.isInteger(dto.totalValue) && dto.totalValue > 0)) errors.push('Valor total inválido');
    if (errors.length) throw new BadRequestException(errors);
  }

  /** Principal nas colunas do pedido; os demais na tabela de vínculos extras. */
  private linksData(dto: Partial<OrderInput>, op: 'set' | 'connect') {
    const { clientIds, responsibleIds } = links(dto);
    return {
      clientId: clientIds[0], responsibleId: responsibleIds[0],
      extraClients: { [op]: clientIds.slice(1).map((id) => ({ id })) },
      extraResponsibles: { [op]: responsibleIds.slice(1).map((id) => ({ id })) },
    };
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
        name: dto.name.trim(), description: dto.description, ...this.linksData(dto, 'connect'),
        deliveryDate: dto.deliveryDate ? toDbDate(dto.deliveryDate) : null, links: (dto.links ?? []) as unknown as Prisma.InputJsonValue, images: dto.images ?? [], totalValue: dto.totalValue ?? null,
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
    const touchesLinks = ['clientId', 'clientIds', 'responsibleId', 'responsibleIds'].some((k) => k in changes);
    const dateChanged = changes.deliveryDate !== undefined && changes.deliveryDate !== base.deliveryDate;
    const merged: Partial<OrderInput> = { ...base, ...changes };
    // Quem manda só `clientId` (um só) substitui a lista inteira; sem nenhum dos dois, os vínculos atuais ficam.
    if (changes.clientId && !changes.clientIds) merged.clientIds = undefined;
    if (changes.responsibleId && !changes.responsibleIds) merged.responsibleIds = undefined;
    await this.validate(merged, dateChanged && !allowPastDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (changes.items) {
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({ data: this.itemsData(changes.items).map((i) => ({ ...i, orderId: id })) });
      }
      return tx.order.update({
        where: { id },
        data: {
          name: changes.name?.trim(), description: changes.description, ...(touchesLinks ? this.linksData(merged, 'set') : {}),
          deliveryDate: changes.deliveryDate === undefined ? undefined : changes.deliveryDate ? toDbDate(changes.deliveryDate) : null,
          links: changes.links ? (changes.links as unknown as Prisma.InputJsonValue) : undefined, images: changes.images, totalValue: changes.totalValue,
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
      where: { id }, data: { status, deliveredAt: status === 'CONCLUIDO' ? today() : null, ...(status === 'CONCLUIDO' ? { stages: STAGES } : {}) }, include, // concluir preenche todas as etapas
    });
    return this.view(o);
  }

  async setStages(id: string, stages: string[]) {
    if (!Array.isArray(stages) || !stages.every((s) => STAGES.includes(s))) throw new BadRequestException('Etapa inválida');
    if (!(await this.prisma.order.count({ where: { id } }))) throw new NotFoundException('Pedido não encontrado');
    const o = await this.prisma.order.update({ where: { id }, data: { stages: STAGES.filter((s) => stages.includes(s)) }, include });
    return this.view(o);
  }

  async addPayment(id: string, amount: number, paidAt?: string) {
    const o = await this.prisma.order.findUnique({ where: { id }, include });
    if (!o) throw new NotFoundException('Pedido não encontrado');
    const date = paidAt ?? new Date().toISOString().slice(0, 10);
    const errors: string[] = [];
    if (!Number.isInteger(amount) || amount <= 0) errors.push('Valor do pagamento inválido');
    if (!isRealDate(date)) errors.push('Data do pagamento inválida');
    if (!o.totalValue) errors.push('Informe o valor total do pedido antes de registrar pagamentos');
    else if (o.payments.reduce((s, p) => s + p.amount, 0) + amount > o.totalValue) errors.push('A soma dos pagamentos ultrapassa o valor total do pedido');
    if (errors.length) throw new BadRequestException(errors);
    await this.prisma.payment.create({ data: { orderId: id, amount, paidAt: toDbDate(date) } });
    return this.get(id);
  }

  /** Itens e pagamentos saem junto (cascade); cliente e responsável permanecem. */
  async remove(id: string) {
    const { count } = await this.prisma.order.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Pedido não encontrado');
    return { id };
  }

  async removePayment(id: string, paymentId: string) {
    const { count } = await this.prisma.payment.deleteMany({ where: { id: paymentId, orderId: id } });
    if (!count) throw new NotFoundException('Pagamento não encontrado');
    return this.get(id);
  }
}
