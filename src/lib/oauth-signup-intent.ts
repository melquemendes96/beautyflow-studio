const STORAGE_KEY = "bf_oauth_context";

export type OAuthFlowContext = {
  mode: "signup" | "login";
  companyName: string;
  planId?: string;
};

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

export function saveOAuthFlowContext(ctx: OAuthFlowContext) {
  if (!hasSessionStorage()) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readOAuthFlowContext(): OAuthFlowContext | null {
  if (!hasSessionStorage()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OAuthFlowContext>;
    if (parsed.mode !== "signup" && parsed.mode !== "login") return null;
    return {
      mode: parsed.mode,
      companyName: typeof parsed.companyName === "string" ? parsed.companyName : "",
      planId: typeof parsed.planId === "string" ? parsed.planId : undefined,
    };
  } catch {
    return null;
  }
}

export function clearOAuthFlowContext() {
  if (!hasSessionStorage()) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
