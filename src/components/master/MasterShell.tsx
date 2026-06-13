import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { useAuth } from "@/contexts/AuthProvider";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Repeat,
  Wallet,
  RefreshCw,
  LifeBuoy,
  AlertTriangle,
  Ticket,
  Settings,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { MasterNotificationsBell } from "@/components/master/MasterNotificationsBell";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const nav: NavItem[] = [
  { to: "/master", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/master/empresas", label: "Empresas", icon: Building2 },
  { to: "/master/planos", label: "Planos", icon: CreditCard },
  { to: "/master/assinaturas", label: "Assinaturas", icon: Repeat },
  { to: "/master/pagamentos", label: "Pagamentos", icon: Wallet },
  { to: "/master/renovacoes", label: "Renovações", icon: RefreshCw },
  { to: "/master/inadimplentes", label: "Inadimplentes", icon: AlertTriangle },
  { to: "/master/suporte", label: "Suporte", icon: LifeBuoy },
  { to: "/master/cupons", label: "Cupons", icon: Ticket },
  { to: "/master/configuracoes", label: "Configurações", icon: Settings },
];

export function MasterShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, session, isPlatformAdmin, isLoading, profileReady, signOut, refresh, ensureFullProfile } =
    useAuth();
  const masterRetryRef = useRef(0);
  const [masterAccessOk, setMasterAccessOk] = useState(false);

  useEffect(() => {
    void ensureFullProfile();
  }, [ensureFullProfile]);

  useEffect(() => {
    if (!profileReady || isLoading) return;

    if (!session) {
      masterRetryRef.current = 0;
      setMasterAccessOk(false);
      void navigate({ to: "/login", replace: true });
      return;
    }

    if (isPlatformAdmin) {
      masterRetryRef.current = 0;
      setMasterAccessOk(true);
      return;
    }

    setMasterAccessOk(false);
    if (masterRetryRef.current < 2) {
      masterRetryRef.current += 1;
      const t = window.setTimeout(() => void refresh(), 800);
      return () => window.clearTimeout(t);
    }

    masterRetryRef.current = 0;
    void navigate({ to: "/login", replace: true });
  }, [isLoading, isPlatformAdmin, navigate, profileReady, refresh, session]);

  if (!profileReady || isLoading || !session || !masterAccessOk) {
    return (
      <div className="min-h-screen bg-secondary/30">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 text-center">
          <div className="rounded-3xl border border-border bg-card p-8 shadow-elegant">
            <Logo onLight className="mx-auto h-11 max-w-[240px]" />
            <div className="mt-4 font-display text-xl">Carregando painel master…</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Validando sua sessão com segurança.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/30">
        <div className="flex h-14 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 hover:bg-accent"
            aria-label="Abrir menu"
          >
            <Menu className="size-5" />
          </button>
          <Logo onLight className="h-9 max-w-[160px]" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <MasterNotificationsBell />
          </div>
        </div>

      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-sidebar-border bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
            <Logo onLight className="h-10 max-w-[200px]" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 hover:bg-accent lg:hidden"
              aria-label="Fechar menu"
            >
              <X className="size-5" />
            </button>
          </div>
          <nav className="flex flex-col gap-1 p-3">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-foreground text-background shadow-soft"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-border bg-card/80 p-4">
            <div className="text-xs text-muted-foreground">Painel master</div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2 text-xs font-medium hover:bg-accent"
            >
              <LogOut className="size-3.5" /> Sair
            </button>
          </div>
        </aside>

        {open && (
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm lg:hidden"
          />
        )}

        <main className="min-w-0 flex-1">
          <div className="hidden h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-8 backdrop-blur lg:flex">
            <div className="text-sm text-muted-foreground">
              Olá, <span className="font-medium text-foreground">{user?.email ?? "Master"}</span>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <MasterNotificationsBell />
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-accent"
              >
                <LogOut className="size-3.5" /> Sair
              </button>
            </div>
          </div>
          <div className="p-5 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function MasterPageTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
