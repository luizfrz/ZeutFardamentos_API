import type { Priority } from './types.js';

const DAY = 86_400_000;

export function daysUntil(isoDate: string, today = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / DAY);
}

/**
 * Prioridade pelo prazo de entrega (dias restantes; atrasado conta como urgente):
 *  - até 7 dias: URGENTE · 8 a 14: ALTA · 15 a 29: MÉDIA · 30 ou mais: BAIXA
 */
export function computePriority(daysLeft: number): Priority {
  if (daysLeft <= 7) return 'URGENTE';
  if (daysLeft <= 14) return 'ALTA';
  if (daysLeft <= 29) return 'MEDIA';
  return 'BAIXA';
}

export const PRIORITY_RANK: Record<Priority, number> = {
  URGENTE: 0,
  ALTA: 1,
  MEDIA: 2,
  BAIXA: 3,
};

/** Confere se a string ISO (yyyy-mm-dd) é uma data real do calendário (ex.: recusa 2026-02-31). */
export function isRealDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
