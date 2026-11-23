import type { Client, Contact, Mold, Order, OrderItem, Responsible, SizeGrid } from './types.js';

/** Remove `null` do Prisma, que o contrato da API representa como campo ausente. */
const nn = <T>(v: T | null | undefined): T | undefined => v ?? undefined;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const toDbDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export const toClient = (c: {
  id: string; type: Client['type']; name: string; document: string | null; address: unknown;
  contacts: { kind: Contact['kind']; value: string; ownerName: string | null; ownerDocument: string | null }[];
}): Client => ({
  id: c.id, type: c.type, name: c.name, document: nn(c.document),
  contacts: c.contacts.map((x) => ({ kind: x.kind, value: x.value, ownerName: nn(x.ownerName), ownerDocument: nn(x.ownerDocument) })),
  address: nn(c.address) as Client['address'],
});

export const toResponsible = (r: { id: string; name: string; cpf: string | null; phone: string }): Responsible =>
  ({ id: r.id, name: r.name, cpf: nn(r.cpf), phone: r.phone });

export const toGrid = (g: { id: string; name: string; description: string; sizes: string[] }): SizeGrid =>
  ({ id: g.id, name: g.name, description: g.description, sizes: g.sizes });

export const toMold = (m: {
  id: string; category: Mold['category']; name: string; group: string | null; models: string[]; gridIds: string[];
  hasSizes: boolean; variationOfId: string | null; notes: string | null; size: string | null; pieceType: string | null; properties: string[];
}): Mold => ({
  id: m.id, category: m.category, name: m.name, group: nn(m.group),
  models: m.models.length ? m.models : undefined, gridIds: m.gridIds.length ? m.gridIds : undefined,
  hasSizes: m.hasSizes || undefined, variationOfId: nn(m.variationOfId), notes: nn(m.notes), size: nn(m.size), pieceType: nn(m.pieceType),
  properties: m.properties.length ? m.properties : undefined,
});

export const toOrderItem = (i: {
  id: string; moldId: string; model: string | null; color: string; grids: unknown; quantity: number | null;
}): OrderItem => ({
  id: i.id, moldId: i.moldId, model: nn(i.model), color: i.color,
  grids: nn(i.grids) as OrderItem['grids'], quantity: nn(i.quantity),
});

export const toOrder = (o: {
  id: string; number: number; name: string; description: string | null; clientId: string; responsibleId: string;
  deliveryDate: Date | null; status: Order['status']; createdAt: Date; deliveredAt: Date | null; links: unknown; images: string[]; stages: string[]; totalValue: number | null;
  items: Parameters<typeof toOrderItem>[0][];
}): Order => ({
  id: o.id, number: o.number, name: o.name, description: nn(o.description), clientId: o.clientId, responsibleId: o.responsibleId,
  deliveryDate: o.deliveryDate ? isoDate(o.deliveryDate) : undefined, status: o.status, createdAt: isoDate(o.createdAt),
  deliveredAt: o.deliveredAt ? isoDate(o.deliveredAt) : undefined,
  items: o.items.map(toOrderItem), links: (o.links as Order['links']) ?? [], images: o.images, stages: o.stages, totalValue: nn(o.totalValue),
});
