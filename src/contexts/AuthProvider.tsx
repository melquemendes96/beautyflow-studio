import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  authConfigError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_REFRESH_EVENTS = new Set([
  "SIGNED_IN",
  "SIGNED_OUT",
  "USER_UPDATED",
  "PASSWORD_RECOVERY",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [companyMemberships, setCompanyMemberships] = useState<CompanyMembership[]>([]);
  const [authConfigError, setAuthConfigError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialSessionHandledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setSession(null);
      setUser(null);
      setIsPlatformAdmin(false);
      setCompanyMemberships([]);
      setAuthConfigError(null);
      setIsLoading(false);
      return;
    }

    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return;
    }

    const run = (async () => {
      setIsLoading(true);
      try {
        const profile = await loadAuthProfile({ waitForSession: true });
        setSession(profile.session);
        setUser(profile.user);
        setIsPlatformAdmin(profile.isPlatformAdmin);
        setCompanyMemberships(profile.companyMemberships);
        setAuthConfigError(profile.authConfigError);
      } finally {
        setIsLoading(false);
      }
    })();

    refreshInFlightRef.current = run;
    try {
      await run;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void refresh();
    }, 400);
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      await getSupabase().auth.signOut();
    }
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    const supabase = getSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") {
        if (!initialSessionHandledRef.current) {
          initialSessionHandledRef.current = true;
          void refresh();
        }
        return;
      }
      if (event === "TOKEN_REFRESHED") {
        return;
      }
      if (PROFILE_REFRESH_EVENTS.has(event)) {
        scheduleRefresh();
      }
    });

    return () => {
      subscription.unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [refresh, scheduleRefresh]);

  const value = useMemo(
    () => ({
      session,
      user,
      isPlatformAdmin,
      companyMemberships,
      isLoading,
      authConfigError,
      refresh,
      signOut,
    }),
    [session, user, isPlatformAdmin, companyMemberships, isLoading, authConfigError, refresh, signOut],
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
