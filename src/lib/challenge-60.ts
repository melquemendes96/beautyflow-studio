/** Desafio 60 dias — só o funil com `desafio=60` pula planos/pagamento. */

export const CHALLENGE_PATH = "/desafio" as const;
export const CHALLENGE_QUERY_VALUE = "60" as const;

/** America/Sao_Paulo — início 01/08/2026 00:00 */
export const CHALLENGE_START_MS = Date.parse("2026-08-01T03:00:00.000Z");
/** Fim: 01/08 + 60 dias corridos → 30/09/2026 00:00 BRT */
export const CHALLENGE_END_MS = Date.parse("2026-09-30T03:00:00.000Z");

export const CHALLENGE_TRIAL_DAYS = 60;
export const CHALLENGE_HEADLINE =
  "60 dias grátis para lotar sua agenda sem depender do WhatsApp";
export const CHALLENGE_SUBHEAD =
  "Teste o JM BeautyFlow com suas clientes reais — sem cartão no desafio.";
export const CHALLENGE_INSTAGRAM_HANDLE = "jmbeautyflow";
export const CHALLENGE_INSTAGRAM_URL = `https://instagram.com/${CHALLENGE_INSTAGRAM_HANDLE}`;

const BANNER_DISMISS_KEY = "bf_challenge60_banner_dismiss_until";
const INTENT_KEY = "bf_challenge60_intent";
const INTENT_BACKUP_KEY = "bf_challenge60_intent_backup";

export type ChallengeIntent = {
  desafio: typeof CHALLENGE_QUERY_VALUE;
  planId?: string;
  leadId?: string;
  trialDays: number;
  companyName?: string;
  email?: string;
};

export type ChallengeCountdown = {
  totalMs: number;
  ended: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export function isChallengeSearchParam(value: unknown): boolean {
  return value === CHALLENGE_QUERY_VALUE || value === 60 || value === "60";
}

export function getChallengeCountdown(nowMs = Date.now()): ChallengeCountdown {
  const totalMs = Math.max(0, CHALLENGE_END_MS - nowMs);
  const ended = totalMs <= 0;
  const sec = Math.floor(totalMs / 1000);
  return {
    totalMs,
    ended,
    days: Math.floor(sec / 86400),
    hours: Math.floor((sec % 86400) / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
  };
}

export function isChallengeBannerDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(BANNER_DISMISS_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function dismissChallengeBanner(days = 7) {
  if (typeof window === "undefined") return;
  try {
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem(BANNER_DISMISS_KEY, String(until));
  } catch {
    /* ignore */
  }
}

export function saveChallengeIntent(intent: ChallengeIntent) {
  const raw = JSON.stringify(intent);
  try {
    sessionStorage.setItem(INTENT_KEY, raw);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(INTENT_BACKUP_KEY, raw);
  } catch {
    /* ignore */
  }
}

export function readChallengeIntent(): ChallengeIntent | null {
  const parse = (raw: string | null): ChallengeIntent | null => {
    if (!raw) return null;
    try {
      const p = JSON.parse(raw) as Partial<ChallengeIntent>;
      if (!isChallengeSearchParam(p.desafio)) return null;
      return {
        desafio: CHALLENGE_QUERY_VALUE,
        planId: typeof p.planId === "string" ? p.planId : undefined,
        leadId: typeof p.leadId === "string" ? p.leadId : undefined,
        trialDays: typeof p.trialDays === "number" && p.trialDays > 0 ? p.trialDays : CHALLENGE_TRIAL_DAYS,
        companyName: typeof p.companyName === "string" ? p.companyName : undefined,
        email: typeof p.email === "string" ? p.email : undefined,
      };
    } catch {
      return null;
    }
  };
  try {
    const fromSession = parse(sessionStorage.getItem(INTENT_KEY));
    if (fromSession) return fromSession;
  } catch {
    /* ignore */
  }
  try {
    return parse(localStorage.getItem(INTENT_BACKUP_KEY));
  } catch {
    return null;
  }
}

export function clearChallengeIntent() {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(INTENT_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}

/** Maior preço entre planos ativos = “melhor plano” do desafio. */
export function pickBestPlanId(
  plans: { id: string; price?: number | null }[],
): string | undefined {
  if (!plans.length) return undefined;
  let best = plans[0]!;
  for (const p of plans) {
    if (Number(p.price ?? 0) > Number(best.price ?? 0)) best = p;
  }
  return best.id;
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Search params vazios tipados para Links do TanStack Router. */
export const emptyCadastroSearch = {
  planId: undefined as string | undefined,
  desafio: undefined as string | undefined,
  leadId: undefined as string | undefined,
};

export const emptyLoginSearch = {
  planId: undefined as string | undefined,
  desafio: undefined as string | undefined,
  leadId: undefined as string | undefined,
};
