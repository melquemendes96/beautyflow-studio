/** Fluxo dinâmico do agendamento público (Equipe + Pacotes). */

export type PublicBookingStep =
  | "servico"
  | "profissional"
  | "whatsapp_pacote"
  | "data"
  | "dados"
  | "confirmado";

export type PublicServiceLike = {
  id: string;
  name: string;
  price?: number | null;
  duration_minutes?: number | null;
  buffer_minutes?: number | null;
  category?: string | null;
  service_kind?: string | null;
  image_url?: string | null;
};

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

export function getSelectedServices(ids: string[], services: PublicServiceLike[]) {
  const set = new Set(ids);
  return services.filter((s) => set.has(s.id));
}

export function getServicesTotalPrice(services: PublicServiceLike[]) {
  return services.reduce((sum, s) => sum + Number(s.price ?? 0), 0);
}

export function getServicesTotalDurationMinutes(services: PublicServiceLike[]) {
  return services.reduce(
    (sum, s) => sum + Number(s.duration_minutes ?? 0) + Number(s.buffer_minutes ?? 0),
    0,
  );
}

export function formatDurationLabel(totalMinutes: number) {
  if (totalMinutes <= 0) return "0 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export function formatMoneyBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function getServiceCategories(services: PublicServiceLike[]) {
  const cats = new Set<string>();
  for (const s of services) {
    const c = (s.category ?? "").trim();
    if (c) cats.add(c);
  }
  return Array.from(cats).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Toggle seleção com regra pacote exclusivo vs singles. */
export function toggleServiceSelection(
  currentIds: string[],
  service: PublicServiceLike,
  allServices: PublicServiceLike[],
): string[] {
  const isPackage = service.service_kind === "package";
  const already = currentIds.includes(service.id);

  if (already) {
    return currentIds.filter((id) => id !== service.id);
  }

  if (isPackage) {
    return [service.id];
  }

  const withoutPackages = currentIds.filter((id) => {
    const s = allServices.find((x) => x.id === id);
    return s?.service_kind !== "package";
  });
  return [...withoutPackages, service.id];
}
