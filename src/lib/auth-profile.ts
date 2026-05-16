import type { Session } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

export type CompanyMembership = {
  company_id: string;
  role: "owner" | "admin" | "staff";
};

export type AuthProfile = {
  session: Session | null;
  user: User | null;
  isPlatformAdmin: boolean;
  companyMemberships: CompanyMembership[];
};

const emptyAuthProfile = (): AuthProfile => ({
  session: null,
  user: null,
  isPlatformAdmin: false,
  companyMemberships: [],
});

function isAuthHttpError(error: { status?: number; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.status === 401) return true;
  return error.code === "PGRST301" || error.code === "401";
}

async function resolveSessionWithRefresh(): Promise<Session | null> {
  const supabase = getSupabase();
  const {
    data: { session: initial },
  } = await supabase.auth.getSession();
  if (!initial?.user) return null;

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error && import.meta.env.DEV) {
    console.warn("[loadAuthProfile] refreshSession:", error.message);
  }
  return refreshed.session ?? initial;
}

async function loadMembershipAndAdmin(session: Session) {
  const supabase = getSupabase();
  const userId = session.user.id;

  const run = async () => {
    const [adminRpcRes, platformRes, companyRes] = await Promise.all([
      supabase.rpc("is_platform_admin"),
      supabase.from("platform_admins").select("id").eq("user_id", userId).maybeSingle(),
      supabase.from("company_users").select("company_id, role").eq("user_id", userId),
    ]);
    return { adminRpcRes, platformRes, companyRes };
  };

  let { adminRpcRes, platformRes, companyRes } = await run();

  const needsRetry =
    isAuthHttpError(adminRpcRes.error) ||
    isAuthHttpError(platformRes.error) ||
    isAuthHttpError(companyRes.error);

  if (needsRetry) {
    await supabase.auth.refreshSession();
    ({ adminRpcRes, platformRes, companyRes } = await run());
  }

  if (import.meta.env.DEV && (platformRes.error || adminRpcRes.error)) {
    console.warn("[loadAuthProfile] admin check", {
      rpc: adminRpcRes.error?.message,
      table: platformRes.error?.message,
    });
  }

  const memberships: CompanyMembership[] = (companyRes.data ?? []).map((row) => ({
    company_id: row.company_id,
    role: row.role as CompanyMembership["role"],
  }));

  const isPlatformAdmin = adminRpcRes.data === true || Boolean(platformRes.data);

  return { isPlatformAdmin, companyMemberships: memberships };
}

/** Seguro para SSR (beforeLoad): não lança se VITE_* ausente ou falha de rede. */
export async function loadAuthProfile(): Promise<AuthProfile> {
  if (!isSupabaseConfigured()) {
    return emptyAuthProfile();
  }

  try {
    const session = await resolveSessionWithRefresh();
    if (!session?.user) {
      return emptyAuthProfile();
    }

    const { isPlatformAdmin, companyMemberships } = await loadMembershipAndAdmin(session);

    return {
      session,
      user: session.user,
      isPlatformAdmin,
      companyMemberships,
    };
  } catch (error) {
    console.error("[loadAuthProfile]", error);
    try {
      const {
        data: { session },
      } = await getSupabase().auth.getSession();
      if (session?.user) {
        return {
          session,
          user: session.user,
          isPlatformAdmin: false,
          companyMemberships: [],
        };
      }
    } catch {
      /* ignore */
    }
    return emptyAuthProfile();
  }
}
