import { digitsOnly } from "@/lib/br-billing-validation";

/** Até 11 dígitos: CPF. A partir do 12º: CNPJ (máx. 14 dígitos). */
export function maskCpfCnpjInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 14);
  if (d.length === 0) return "";
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  const c = d; // 12–14
  if (c.length <= 12) {
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8)}`;
  }
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export function maskCepInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** (DD) NNNNN-NNNN ou (DD) NNNN-NNNN */
export function maskBrazilPhoneInput(raw: string): string {
  const d = digitsOnly(raw).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
