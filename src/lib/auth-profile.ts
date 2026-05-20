import type { Session } from "@supabase/supabase-js";
import { getSupabase, getSupabaseKeyConfigurationError, isSupabaseConfigured } from "@/lib/supabaseClient";
import { readSessionQuick } from "@/lib/auth-bootstrap";
import { waitForValidSession } from "@/lib/wait-for-auth-session";

export type CompanyMembership = {
  company_id: string;
  role: "owner" | "admin" | "staff";
};

export type AuthProfile = {
  session: Session | null;
  user: Session["user"] | null;
  isPlatformAdmin: boolean;
  companyMemberships: CompanyMembership[];
  authConfigError: string | null;
};

const MASTER_EMAILS = new Set(["melquemendes96@gmail.com"]);

const emptyAuthProfile = (authConfigError: string | null = null): AuthProfile => ({
  session: null,
  user: null,
  isPlatformAdmin: false,
  companyMemberships: [],
  authConfigError,
});

function masterEmailsFromEnv(): Set<string> {
  const raw = (import.meta.env.VITE_PLATFORM_MASTER_EMAILS as string | undefined) ?? "";
  const list = [...MASTER_EMAILS, ...raw.split(",")]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
}

export function resolveUserEmail(session: Session): string | null {
  const direct = session.user.email?.trim().toLowerCase();
  if (direct) return direct;
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const fromMeta = meta?.email;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim().toLowerCase();
  const identities = session.user.identities;
  if (Array.isArray(identities)) {
    for (const id of identities) {
      const data = id as { identity_data?: { email?: string } };
      const ie = data.identity_data?.email;
      if (typeof ie === "string" && ie.trim()) return ie.trim().toLowerCase();
    }
  }
  return null;
}

function isAuthHttpError(error: { status?: number; code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 401) return true;
  return error.code === "PGRST301" || error.code === "401";
}

export function masterFromUserMetadata(session: Session | null | undefined): boolean {
  if (!session?.user) return false;
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = session.user.app_metadata as Record<string, unknown> | undefined;
  const role = meta?.role ?? appMeta?.role;
  const isSuper = meta?.is_super_admin ?? appMeta?.is_super_admin;
  if (role === "master" || role === "platform_admin") return true;
  if (isSuper === true || isSuper === "true") return true;
  return false;
}

export function isMasterAccount(session: Session | null | undefined): boolean {
  if (!session?.user) return false;
  if (masterFromUserMetadata(session)) return true;
  const email = resolveUserEmail(session);
  return email ? masterEmailsFromEnv().has(email) : false;
}

type PanelContextPayload = {
  is_platform_admin?: boolean;
  company_memberships?: Array<{ company_id: string; role: string }>;
};

async function syncPlatformAdminInDatabase(): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("ensure_platform_admin");
  if (error) {
    if (import.meta.env.DEV) {
      console.warn("[auth] ensure_platform_admin:", error.message);
    }
    return false;
  }
  const payload = data as { ok?: boolean; is_platform_admin?: boolean } | null;
  return payload?.ok === true || payload?.is_platform_admin === true;
}

async function loadPanelContext(session: Session): Promise<{
  isPlatformAdmin: boolean;
  companyMemberships: CompanyMembership[];
}> {
  const supabase = getSupabase();
  const userId = session.user.id;
  let isPlatformAdmin = isMasterAccount(session);
  let memberships: CompanyMembership[] = [];

  const { data: rpcData, error: rpcError } = await supabase.rpc("get_auth_panel_context");

  if (isPlatformAdmin || (rpcData as PanelContextPayload)?.is_platform_admin) {
    void syncPlatformAdminInDatabase();
  }

  if (isAuthHttpError(rpcError)) {
    if (import.meta.env.DEV) {
      console.warn("[loadAuthProfile] sessão inválida (401) — limpando auth local");
    }
    await supabase.auth.signOut().catch(() => undefined);
    return { isPlatformAdmin: false, companyMemberships: [] };
  }

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const payload = rpcData as PanelContextPayload;
    isPlatformAdmin = payload.is_platform_admin === true || isPlatformAdmin;
    memberships = (payload.company_memberships ?? [])
      .map((row) => ({
        company_id: String(row.company_id),
        role: row.role as CompanyMembership["role"],
      }))
      .filter((m) => m.company_id.length > 0);
  } else if (import.meta.env.DEV && rpcError) {
    console.warn("[loadAuthProfile] get_auth_panel_context:", rpcError.message);
  }

  if (memberships.length === 0 && !isPlatformAdmin) {
    const { data: companyRows } = await supabase
      .from("company_users")
      .select("company_id, role")
      .eq("user_id", userId);
    memberships = (companyRows ?? []).map((row) => ({
      company_id: row.company_id,
      role: row.role as CompanyMembership["role"],
    }));
  }

  return { isPlatformAdmin, companyMemberships: memberships };
}

export async function loadAuthProfile(opts?: {
  waitForSession?: boolean;
  full?: boolean;
}): Promise<AuthProfile> {
  const configError = getSupabaseKeyConfigurationError();
  if (configError) {
    return emptyAuthProfile(configError);
  }

  if (!isSupabaseConfigured()) {
    return emptyAuthProfile("Supabase não configurado no .env.");
  }

  try {
    const session = opts?.waitForSession
      ? await waitForValidSession(8)
      : await readSessionQuick();

    if (!session?.user) {
      return emptyAuthProfile();
    }

    const quickMaster = isMasterAccount(session);
    if (opts?.full === false) {
      return {
        session,
        user: session.user,
        isPlatformAdmin: quickMaster,
        companyMemberships: [],
        authConfigError: null,
      };
    }

    const result = await loadPanelContext(session);

    return {
      session,
      user: session.user,
      isPlatformAdmin: result.isPlatformAdmin,
      companyMemberships: result.companyMemberships,
      authConfigError: null,
    };
  } catch (error) {
    console.error("[loadAuthProfile]", error);
    return emptyAuthProfile();
  }
}
