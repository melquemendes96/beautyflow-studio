/**
 * Leitura de números digitados no formato brasileiro.
 *
 * O usuário digita "60,00", "1.200,50" ou "R$ 90" — `Number()` puro devolve NaN
 * nesses casos e o formulário falha como se estivesse incompleto.
 */

/** `null` quando o campo está vazio ou não contém número válido. */
export function parseBrDecimal(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;

  const cleaned = String(raw)
    .replace(/\s/g, "")
    .replace(/r\$/gi, "")
    .replace(/[^0-9.,-]/g, "");

  if (!cleaned || !/\d/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const body = cleaned.replace(/-/g, "");

  const hasComma = body.includes(",");
  const dotCount = (body.match(/\./g) ?? []).length;

  let normalized: string;
  if (hasComma) {
    // Vírgula é sempre o separador decimal; pontos são milhar.
    normalized = body.replace(/\./g, "").replace(",", ".");
  } else if (dotCount > 1) {
    normalized = body.replace(/\./g, "");
  } else if (dotCount === 1 && /\.\d{3}$/.test(body)) {
    // "1.200" no padrão BR é milhar, não decimal.
    normalized = body.replace(".", "");
  } else {
    normalized = body;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/** Inteiro não negativo (minutos, sessões). `null` quando vazio/inválido. */
export function parseBrInteger(raw: string | number | null | undefined): number | null {
  const value = parseBrDecimal(raw);
  if (value == null) return null;
  return Math.round(value);
}
