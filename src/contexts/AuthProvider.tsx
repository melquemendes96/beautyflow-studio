import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { loadAuthProfile, type CompanyMembership } from "@/lib/auth-profile";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isPlatformAdmin: boolean;
  companyMemberships: CompanyMembership[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [companyMemberships, setCompanyMemberships] = useState<CompanyMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setSession(null);
      setUser(null);
      setIsPlatformAdmin(false);
      setCompanyMemberships([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const profile = await loadAuthProfile();
      setSession(profile.session);
      setUser(profile.user);
      setIsPlatformAdmin(profile.isPlatformAdmin);
      setCompanyMemberships(profile.companyMemberships);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      await getSupabase().auth.signOut();
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      return;
    }
    const supabase = getSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo(
    () => ({
      session,
      user,
      isPlatformAdmin,
      companyMemberships,
      isLoading,
      refresh,
      signOut,
    }),
    [session, user, isPlatformAdmin, companyMemberships, isLoading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}
