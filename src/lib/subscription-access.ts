/** Snapshot mínimo da assinatura do tenant para guards e roteamento. */
export type SubscriptionSnapshot = {
  status: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
};

export type SubscriptionAccessReason =
  | "ok"
  | "no_subscription"
  | "pending_payment"
  | "trial_expired"
  | "past_due"
  | "canceled"
  | "paused"
  | "period_ended"
  | "suspended";

function parseTs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Dashboard liberado apenas com active válido ou trialing dentro do período. */
export function isSubscriptionDashboardAllowed(
  sub: SubscriptionSnapshot | null | undefined,
  now = Date.now(),
): boolean {
  return getSubscriptionAccessReason(sub, now) === "ok";
}

export function getSubscriptionAccessReason(
  sub: SubscriptionSnapshot | null | undefined,
  now = Date.now(),
): SubscriptionAccessReason {
  if (!sub?.status) return "no_subscription";

  const st = String(sub.status);
  const periodEnd = parseTs(sub.trial_end ?? sub.current_period_end);
  const periodStarted = parseTs(sub.trial_start ?? sub.current_period_start);

  if (st === "active") {
    if (periodEnd !== null && periodEnd <= now) return "period_ended";
    return "ok";
  }

  if (st === "trialing") {
    if (periodEnd !== null && periodEnd <= now) return "trial_expired";
    if (periodStarted !== null && periodStarted > now) return "pending_payment";
    return "ok";
  }

  if (st === "pending_payment") return "pending_payment";
  if (st === "trial_expired") return "trial_expired";
  if (st === "past_due") return "past_due";
  if (st === "canceled") return "canceled";
  if (st === "paused") return "paused";

  return "no_subscription";
}

export function subscriptionAccessMessage(reason: SubscriptionAccessReason): string {
  switch (reason) {
    case "ok":
      return "Acesso liberado";
    case "no_subscription":
      return "Escolha seu plano para continuar";
    case "pending_payment":
      return "Pagamento pendente — finalize em Planos e cobrança";
    case "trial_expired":
      return "Seu teste expirou — renove para voltar ao painel";
    case "past_due":
      return "Assinatura em atraso — regularize o pagamento";
    case "canceled":
      return "Assinatura cancelada — escolha um plano para reativar";
    case "paused":
      return "Assinatura pausada — entre em contato ou reative o plano";
    case "period_ended":
      return "Período da assinatura encerrado — renove para continuar";
    case "suspended":
      return "Conta suspensa — fale com o suporte";
    default:
      return "Regularize sua assinatura para continuar";
  }
}
