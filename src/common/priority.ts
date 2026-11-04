import type { Priority } from './types.js';

const DAY = 86_400_000;

export function daysUntil(isoDate: string, today = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / DAY);
}

/**
 * Prioridade = prazo de entrega + quantidade de peças.
 *  - menos de 7 dias: URGENTE se >= 50 peças, senão ALTA
 *  - 7 a 14 dias: MÉDIA
 *  - mais de 14 dias: BAIXA
 */
export function computePriority(daysLeft: number, pieces: number): Priority {
  if (daysLeft < 7) return pieces >= 50 ? 'URGENTE' : 'ALTA';
  if (daysLeft <= 14) return 'MEDIA';
  return 'BAIXA';
}

/** P.E. = nível de prazo de entrega (1 = menos de 7 dias) */
export function deadlineLevel(daysLeft: number): 1 | 2 | 3 {
  return daysLeft < 7 ? 1 : daysLeft <= 14 ? 2 : 3;
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
