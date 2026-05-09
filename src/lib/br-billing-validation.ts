/** Apenas dígitos (CPF/CNPJ/CEP/telefone). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCep(digits: string): boolean {
  return digits.length === 8;
}

function cpfCheckDigits(base: number[]): boolean {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += base[i] * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== base[9]) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += base[i] * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === base[10];
}

export function isValidCpf(digits: string): boolean {
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const base = digits.split("").map(Number);
  return cpfCheckDigits(base);
}

function cnpjCheckDigits(d: number[]): boolean {
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * w1[i];
  let r = sum % 11;
  const dv1 = r < 2 ? 0 : 11 - r;
  if (dv1 !== d[12]) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += d[i] * w2[i];
  r = sum % 11;
  const dv2 = r < 2 ? 0 : 11 - r;
  return dv2 === d[13];
}

export function isValidCnpj(digits: string): boolean {
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const base = digits.split("").map(Number);
  return cnpjCheckDigits(base);
}

export function isValidCpfOrCnpj(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length === 11) return isValidCpf(d);
  if (d.length === 14) return isValidCnpj(d);
  return false;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  const t = s.trim();
  return t.length > 3 && EMAIL_RE.test(t);
}

/** Telefone BR: 10 ou 11 dígitos (DDD + número). */
export function isValidBrazilPhone(raw: string): boolean {
  const d = digitsOnly(raw);
  return d.length === 10 || d.length === 11;
}

export function isValidUf(s: string): boolean {
  const u = s.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(u);
}
