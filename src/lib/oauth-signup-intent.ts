const STORAGE_KEY = "bf_oauth_context";
const LOCAL_BACKUP_KEY = "bf_oauth_context_backup";

export type OAuthFlowContext = {
  mode: "signup" | "login";
  companyName: string;
  planId?: string;
};

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function saveOAuthFlowContext(ctx: OAuthFlowContext) {
  const raw = JSON.stringify(ctx);
  if (hasSessionStorage()) {
    try {
      sessionStorage.setItem(STORAGE_KEY, raw);
    } catch {
      /* ignore */
    }
  }
  if (hasLocalStorage()) {
    try {
      localStorage.setItem(LOCAL_BACKUP_KEY, raw);
    } catch {
      /* ignore */
    }
  }
}

export function readOAuthFlowContext(): OAuthFlowContext | null {
  const parse = (raw: string | null): OAuthFlowContext | null => {
    if (!raw) return null;
    try {
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
  };

  if (hasSessionStorage()) {
    try {
      const fromSession = parse(sessionStorage.getItem(STORAGE_KEY));
      if (fromSession) return fromSession;
    } catch {
      /* ignore */
    }
  }
  if (hasLocalStorage()) {
    try {
      return parse(localStorage.getItem(LOCAL_BACKUP_KEY));
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Lê nome do studio na URL de retorno OAuth (?bf_studio=). */
export function readStudioNameFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("bf_studio") ?? params.get("bt_studio");
    const t = v?.trim();
    return t && t.length >= 2 ? t : null;
  } catch {
    return null;
  }
}

export function appendStudioNameToRedirectUrl(baseUrl: string, companyName: string): string {
  const name = companyName.trim();
  if (name.length < 2) return baseUrl;
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}bf_studio=${encodeURIComponent(name)}`;
}

export function clearOAuthFlowContext() {
  if (hasSessionStorage()) {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(LOCAL_BACKUP_KEY);
    } catch {
      /* ignore */
    }
  }
}
