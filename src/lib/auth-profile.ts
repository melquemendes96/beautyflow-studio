import type { Session } from "@supabase/supabase-js";
import { getSupabase, getSupabaseKeyConfigurationError, isSupabaseConfigured } from "@/lib/supabaseClient";

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

const emptyAuthProfile = (authConfigError: string | null = null): AuthProfile => ({
  session: null,
  user: null,
  isPlatformAdmin: false,
  companyMemberships: [],
  authConfigError,
});

function isAuthHttpError(error: { status?: number; code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 401) return true;
  return (
    error.code === "PGRST301" ||
    error.code === "401" ||
    Boolean(error.message?.toLowerCase().includes("jwt"))
  );
}

function masterFromUserMetadata(session: Session): boolean {
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const appMeta = session.user.app_metadata as Record<string, unknown> | undefined;
  const role = meta?.role ?? appMeta?.role;
  const isSuper = meta?.is_super_admin ?? appMeta?.is_super_admin;
  if (role === "master" || role === "platform_admin") return true;
  if (isSuper === true || isSuper === "true") return true;
  return false;
}

type PanelContextPayload = {
  is_platform_admin?: boolean;
  company_memberships?: Array<{ company_id: string; role: string }>;
};

async function resolveSession(): Promise<Session | null> {
  const supabase = getSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error && isAuthHttpError(error)) {
    await supabase.auth.signOut();
    return null;
  }
  return session?.user ? session : null;
}

async function loadPanelContext(session: Session): Promise<{
  isPlatformAdmin: boolean;
  companyMemberships: CompanyMembership[];
  authInvalid: boolean;
}> {
  const supabase = getSupabase();
  const metadataMaster = masterFromUserMetadata(session);

  const { data, error } = await supabase.rpc("get_auth_panel_context");

  if (!error && data && typeof data === "object") {
    const payload = data as PanelContextPayload;
    const memberships: CompanyMembership[] = (payload.company_memberships ?? [])
      .map((row) => ({
        company_id: String(row.company_id),
        role: row.role as CompanyMembership["role"],
      }))
      .filter((m) => m.company_id.length > 0);

    const isPlatformAdmin = payload.is_platform_admin === true || metadataMaster;
    return { isPlatformAdmin, companyMemberships: memberships, authInvalid: false };
  }

  if (isAuthHttpError(error)) {
    if (import.meta.env.DEV) {
      console.warn("[loadAuthProfile] get_auth_panel_context:", error?.message);
    }
    return {
      isPlatformAdmin: metadataMaster,
      companyMemberships: [],
      authInvalid: !metadataMaster,
    };
  }

  const userId = session.user.id;
  const [adminRpcRes, platformRes, companyRes] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    supabase.from("platform_admins").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("company_users").select("company_id, role").eq("user_id", userId),
  ]);

  const allAuthErrors =
    isAuthHttpError(adminRpcRes.error) &&
    isAuthHttpError(platformRes.error) &&
    isAuthHttpError(companyRes.error);

  if (allAuthErrors) {
    return {
      isPlatformAdmin: metadataMaster,
      companyMemberships: [],
      authInvalid: !metadataMaster,
    };
  }

  const memberships: CompanyMembership[] = (companyRes.data ?? []).map((row) => ({
    company_id: row.company_id,
    role: row.role as CompanyMembership["role"],
  }));

  const isPlatformAdmin =
    metadataMaster || adminRpcRes.data === true || Boolean(platformRes.data);

  return { isPlatformAdmin, companyMemberships: memberships, authInvalid: false };
}

export async function loadAuthProfile(): Promise<AuthProfile> {
  const configError = getSupabaseKeyConfigurationError();
  if (configError) {
    return emptyAuthProfile(configError);
  }

  if (!isSupabaseConfigured()) {
    return emptyAuthProfile();
  }

  try {
    const session = await resolveSession();
    if (!session?.user) {
      return emptyAuthProfile();
    }

    const result = await loadPanelContext(session);
    if (result.authInvalid) {
      await getSupabase().auth.signOut();
      return emptyAuthProfile(
        "Sessão inválida ou chave Supabase incorreta. Confira VITE_SUPABASE_ANON_KEY (JWT eyJ...) e faça login novamente.",
      );
    }

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
