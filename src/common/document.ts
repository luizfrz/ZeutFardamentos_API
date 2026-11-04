const onlyDigits = (v: string) => v.replace(/\D/g, '');
const allEqual = (d: string) => /^(\d)\1+$/.test(d);

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || allEqual(d)) return false;
  for (const t of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(d[i]) * (t + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

export function isValidCnpj(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 14 || allEqual(d)) return false;
  for (const t of [12, 13]) {
    let sum = 0;
    let weight = t - 7;
    for (let i = 0; i < t; i++) {
      sum += Number(d[i]) * weight--;
      if (weight < 2) weight = 9;
    }
    const dv = sum % 11 < 2 ? 0 : 11 - (sum % 11);
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

export const isValidDocument = (v: string) => isValidCpf(v) || isValidCnpj(v);
export const normalizeDocument = onlyDigits;

/** Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular com 9). */
export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value);
  return (d.length === 10 || d.length === 11) && d[0] !== '0' && (d.length === 10 || d[2] === '9');
}
