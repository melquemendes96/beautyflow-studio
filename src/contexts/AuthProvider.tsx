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
import { useLocation } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { loadAuthProfile, type CompanyMembership, isMasterAccount } from "@/lib/auth-profile";
import { getAuthConfigError, readSessionQuick, withAuthTimeout } from "@/lib/auth-bootstrap";
import { authPerf, authPerfTimed } from "@/lib/auth-perf";
import { isPublicAuthPath } from "@/lib/public-routes";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabaseClient";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isPlatformAdmin: boolean;
  companyMemberships: CompanyMembership[];
  /** false = UI pública pode renderizar; não bloqueia /login. */
  isLoading: boolean;
  /** RPC/memberships carregados (necessário antes de redirect pós-login). */
  profileReady: boolean;
  authConfigError: string | null;
  refresh: (opts?: { silent?: boolean; waitForSession?: boolean; full?: boolean }) => Promise<void>;
  /** Carrega perfil completo (painéis protegidos). */
  ensureFullProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_REFRESH_EVENTS = new Set(["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED", "PASSWORD_RECOVERY"]);

const AUTH_BOOT_TIMEOUT_MS = 5000;
const DEFERRED_PROFILE_MS = 1500;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [companyMemberships, setCompanyMemberships] = useState<CompanyMembership[]>([]);
  const [authConfigError, setAuthConfigError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const fullProfileLoadedRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootedRef = useRef(false);
  const initialSessionHandledRef = useRef(false);
  const deferredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyQuickSession = useCallback((s: Session | null) => {
    setSession(s);
    setUser(s?.user ?? null);
    if (s?.user) {
      setIsPlatformAdmin(isMasterAccount(s));
    } else {
      setIsPlatformAdmin(false);
      setCompanyMemberships([]);
      fullProfileLoadedRef.current = false;
    }
  }, []);

  const refresh = useCallback(
    async (opts?: { silent?: boolean; waitForSession?: boolean; full?: boolean }) => {
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

      const wantFull = opts?.full !== false;

      const run = (async () => {
        if (!opts?.silent) setIsLoading(true);
        try {
          const profile = await authPerfTimed("loadAuthProfile", () =>
            withAuthTimeout(
              loadAuthProfile({
                waitForSession: opts?.waitForSession ?? false,
                full: wantFull,
              }),
              AUTH_BOOT_TIMEOUT_MS,
            ),
          );
          setSession(profile.session);
          setUser(profile.user);
          setIsPlatformAdmin(profile.isPlatformAdmin);
          setCompanyMemberships(profile.companyMemberships);
          setAuthConfigError(profile.authConfigError);
          if (wantFull && profile.session) {
            fullProfileLoadedRef.current = true;
          }
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

  const ensureFullProfile = useCallback(async () => {
    if (!session || fullProfileLoadedRef.current) {
      if (!session) setProfileReady(true);
      return;
    }
    await refresh({ silent: true, waitForSession: false, full: true });
  }, [refresh, session]);

  const scheduleRefresh = useCallback(
    (opts?: { silent?: boolean; waitForSession?: boolean; full?: boolean }) => {
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
    fullProfileLoadedRef.current = false;
  }, [applyQuickSession]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    authPerf("boot início", { path: pathname });

    const configError = getAuthConfigError();
    if (configError) {
      setAuthConfigError(configError);
      setProfileReady(true);
      authPerf("boot fim — config error");
      return;
    }

    if (!isSupabaseConfigured()) {
      setProfileReady(true);
      authPerf("boot fim — supabase off");
      return;
    }

    const isPublic = isPublicAuthPath(pathname);
    const isOAuthCallback = pathname === "/auth/callback";

    void (async () => {
      const quick = await authPerfTimed("getSession", readSessionQuick);
      applyQuickSession(quick);

      if (!quick) {
        setProfileReady(true);
        authPerf("boot fim — sem sessão");
        return;
      }

      if (isOAuthCallback) {
        await refresh({ silent: true, waitForSession: false, full: true });
        authPerf("boot fim — auth/callback");
        return;
      }

      if (isPublic) {
        setProfileReady(true);
        authPerf("boot fim — rota pública com sessão (perfil completo adiado)");
        deferredTimerRef.current = window.setTimeout(() => {
          if (!fullProfileLoadedRef.current) {
            void refresh({ silent: true, full: true });
          }
        }, DEFERRED_PROFILE_MS);
        return;
      }

      await refresh({ silent: true, waitForSession: false, full: true });
      authPerf("boot fim — rota protegida");
    })();

    const supabase = getSupabase();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;

      if (event === "INITIAL_SESSION") {
        if (initialSessionHandledRef.current) return;
        initialSessionHandledRef.current = true;
        return;
      }

      if (PROFILE_REFRESH_EVENTS.has(event)) {
        fullProfileLoadedRef.current = false;
        scheduleRefresh({
          silent: true,
          waitForSession: event === "SIGNED_IN",
          full: true,
        });
      }
    });

    return () => {
      subscription.unsubscribe();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (deferredTimerRef.current) clearTimeout(deferredTimerRef.current);
    };
  }, [applyQuickSession, pathname, refresh, scheduleRefresh]);

  useEffect(() => {
    if (!session || isPublicAuthPath(pathname) || fullProfileLoadedRef.current) return;
    void ensureFullProfile();
  }, [pathname, session, ensureFullProfile]);

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
      ensureFullProfile,
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
      ensureFullProfile,
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
