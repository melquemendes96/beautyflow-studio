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
import { loadAuthProfile, type CompanyMembership, isMasterAccount } from "@/lib/auth-profile";
import { getAuthConfigError, readSessionQuick, withAuthTimeout } from "@/lib/auth-bootstrap";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isPlatformAdmin: boolean;
  companyMemberships: CompanyMembership[];
  /** Boot rápido (getSession) — rotas públicas liberam a UI quando false. */
  isLoading: boolean;
  /** Perfil completo (RPC/memberships) carregado — use antes de redirect pós-login. */
  profileReady: boolean;
  authConfigError: string | null;
  refresh: (opts?: { silent?: boolean; waitForSession?: boolean }) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_REFRESH_EVENTS = new Set(["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "PASSWORD_RECOVERY"]);

const AUTH_BOOT_TIMEOUT_MS = 6000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [companyMemberships, setCompanyMemberships] = useState<CompanyMembership[]>([]);
  const [authConfigError, setAuthConfigError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);

  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootedRef = useRef(false);

  const applyQuickSession = useCallback((s: Session | null) => {
    setSession(s);
    setUser(s?.user ?? null);
    if (s?.user) {
      setIsPlatformAdmin(isMasterAccount(s));
    } else {
      setIsPlatformAdmin(false);
      setCompanyMemberships([]);
    }
  }, []);

  const refresh = useCallback(
    async (opts?: { silent?: boolean; waitForSession?: boolean }) => {
      const configError = getAuthConfigError();
      if (configError) {
        setAuthConfigError(configError);
        applyQuickSession(null);
        setIsLoading(false);
        setProfileReady(true);
        return;
      }

      if (!isSupabaseConfigured()) {
        applyQuickSession(null);
        setAuthConfigError(null);
        setIsLoading(false);
        setProfileReady(true);
        return;
      }

      if (refreshInFlightRef.current) {
        await refreshInFlightRef.current;
        return;
      }

      const run = (async () => {
        if (!opts?.silent) setIsLoading(true);
        try {
          const profile = await withAuthTimeout(
            loadAuthProfile({
              waitForSession: opts?.waitForSession ?? false,
              full: true,
            }),
            AUTH_BOOT_TIMEOUT_MS,
          );
          setSession(profile.session);
          setUser(profile.user);
          setIsPlatformAdmin(profile.isPlatformAdmin);
          setCompanyMemberships(profile.companyMemberships);
          setAuthConfigError(profile.authConfigError);
        } catch (e) {
          if (import.meta.env.DEV) console.warn("[AuthProvider] refresh timeout/error", e);
          const quick = await readSessionQuick();
          applyQuickSession(quick);
          if (!quick) setAuthConfigError(null);
        } finally {
          setIsLoading(false);
          setProfileReady(true);
        }
      })();

      refreshInFlightRef.current = run;
      try {
        await run;
      } finally {
        refreshInFlightRef.current = null;
      }
    },
    [applyQuickSession],
  );

  const scheduleRefresh = useCallback(
    (opts?: { silent?: boolean; waitForSession?: boolean }) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void refresh(opts);
      }, 300);
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured()) {
      await getSupabase().auth.signOut();
    }
    applyQuickSession(null);
    setIsPlatformAdmin(false);
    setCompanyMemberships([]);
    setIsLoading(false);
    setProfileReady(true);
  }, [applyQuickSession]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const configError = getAuthConfigError();
    if (configError) {
      setAuthConfigError(configError);
      setIsLoading(false);
      setProfileReady(true);
      return;
    }

    if (!isSupabaseConfigured()) {
      setIsLoading(false);
      setProfileReady(true);
      return;
    }

    const safetyTimer = window.setTimeout(() => {
      setIsLoading(false);
      setProfileReady(true);
    }, AUTH_BOOT_TIMEOUT_MS);

    void (async () => {
      const quick = await readSessionQuick();
      applyQuickSession(quick);
      setIsLoading(false);

      if (quick) {
        await refresh({ silent: true, waitForSession: false });
      } else {
        setProfileReady(true);
      }
    })();

    const supabase = getSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      if (event === "INITIAL_SESSION") {
        void refresh({ silent: true, waitForSession: false });
        return;
      }
      if (PROFILE_REFRESH_EVENTS.has(event)) {
        scheduleRefresh({ silent: true, waitForSession: event === "SIGNED_IN" });
      }
    });

    return () => {
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [applyQuickSession, refresh, scheduleRefresh]);

  const value = useMemo(
    () => ({
      session,
      user,
      isPlatformAdmin,
      companyMemberships,
      isLoading,
      profileReady,
      authConfigError,
      refresh,
      signOut,
    }),
    [
      session,
      user,
      isPlatformAdmin,
      companyMemberships,
      isLoading,
      profileReady,
      authConfigError,
      refresh,
      signOut,
    ],
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
