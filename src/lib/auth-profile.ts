import type { Session, User } from "@supabase/supabase-js";
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

/** Seguro para SSR (beforeLoad): não lança se VITE_* ausente ou falha de rede. */
export async function loadAuthProfile(): Promise<AuthProfile> {
  if (!isSupabaseConfigured()) {
    return emptyAuthProfile();
  }

  try {
    const supabase = getSupabase();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return emptyAuthProfile();
    }

    const userId = session.user.id;

    const [platformRes, companyRes] = await Promise.all([
      supabase.from("platform_admins").select("id").eq("user_id", userId).maybeSingle(),
      supabase.from("company_users").select("company_id, role").eq("user_id", userId),
    ]);

    const memberships: CompanyMembership[] = (companyRes.data ?? []).map((row) => ({
      company_id: row.company_id,
      role: row.role as CompanyMembership["role"],
    }));

    return {
      session,
      user: session.user,
      isPlatformAdmin: Boolean(platformRes.data),
      companyMemberships: memberships,
    };
  } catch (error) {
    console.error("[loadAuthProfile]", error);
    return emptyAuthProfile();
  }
}
