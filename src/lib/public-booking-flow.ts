/** Fluxo dinâmico do agendamento público (Equipe + Pacotes). */

export type PublicBookingStep =
  | "servico"
  | "profissional"
  | "whatsapp_pacote"
  | "data"
  | "dados"
  | "confirmado";

export function buildPublicBookingSteps(input: {
  isReschedule: boolean;
  needsProviderStep: boolean;
  isPackage: boolean;
  /** Cliente contratando pacote pela 1ª vez (após WhatsApp, antes da data). */
  packageFirstPurchase?: boolean;
}): PublicBookingStep[] {
  if (input.isReschedule) return ["data", "dados"];
  const steps: PublicBookingStep[] = ["servico"];
  if (!input.isPackage) {
    if (input.needsProviderStep) steps.push("profissional");
    steps.push("data", "dados");
    return steps;
  }
  steps.push("whatsapp_pacote");
  if (input.packageFirstPurchase && input.needsProviderStep) steps.push("profissional");
  steps.push("data", "dados");
  return steps;
}

export function toYmdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO DOW: 1=seg … 7=dom */
export function isDateAllowedForPackage(
  date: Date,
  rules: { allowedDow: number[]; holidays: string[] },
): boolean {
  const ymd = toYmdLocal(date);
  if (rules.holidays.includes(ymd)) return false;
  if (rules.allowedDow.length === 0) return true;
  const isoDow = date.getDay() === 0 ? 7 : date.getDay();
  return rules.allowedDow.includes(isoDow);
}
