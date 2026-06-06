import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { useCurrentCompany } from "@/lib/current-company";
import { subscriptionService } from "@/services/subscriptionService";
import { companyService } from "@/services/companyService";
import { brandingService } from "@/services/brandingService";
import { displayStudioName } from "@/lib/branding-utils";
import { Logo } from "@/components/brand/Logo";
import {
  LayoutDashboard, Calendar, Users, Scissors, Clock, BarChart3,
  Palette, MessageCircle, CreditCard, Settings, Menu, X, LogOut, UserRound,
} from "lucide-react";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/agenda", label: "Agenda", icon: Calendar },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/servicos", label: "Serviços", icon: Scissors },
  { to: "/admin/equipe", label: "Equipe", icon: UserRound },
  { to: "/admin/lista-espera", label: "Lista de espera", icon: Clock },
  { to: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/admin/branding", label: "Aparência da marca", icon: Palette },
  { to: "/admin/whatsapp", label: "WhatsApp Oficial", icon: MessageCircle },
  { to: "/admin/plano", label: "Plano e assinatura", icon: CreditCard },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export function AdminShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const {
    user,
    session,
    isPlatformAdmin,
    companyMemberships,
    isLoading,
    profileReady,
    signOut,
    refresh,
    ensureFullProfile,
  } = useAuth();
  const { companyId, hasCompany } = useCurrentCompany();
  const membershipSyncRef = useRef(0);

  const companyQuery = useQuery({
    queryKey: ["admin", "company", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyService.getByIdForAdmin(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const brandingQuery = useQuery({
    queryKey: ["admin", "branding", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await brandingService.getByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const studioDisplayName = useMemo(() => {
    return displayStudioName(
      companyQuery.data,
      brandingQuery.data as Parameters<typeof displayStudioName>[1],
    );
  }, [companyQuery.data, brandingQuery.data]);

  const subscriptionQuery = useQuery({
    queryKey: ["admin", "subscription", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await subscriptionService.getSubscriptionByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const planSummary = useMemo(() => {
    const sub = subscriptionQuery.data;
    const plan = sub?.plans as { name?: string | null } | null | undefined;
    const name = plan?.name?.trim() || "Plano";
    const endRaw = sub?.current_period_end as string | null | undefined;
    const end = endRaw ? new Date(endRaw) : null;
    const renewal =
      end && !Number.isNaN(end.getTime())
        ? end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
        : null;
    const st = String(sub?.status ?? "");
    if (st === "trialing") {
      return { title: name, subtitle: renewal ? `Teste até ${renewal}` : "Período de testes ativo" };
    }
    if (!sub) {
      return { title: "Seu plano", subtitle: "Ative para usar todos os recursos" };
    }
    return {
      title: name,
      subtitle: renewal ? `Renova em ${renewal}` : "Gerencie cobrança e upgrade",
    };
  }, [subscriptionQuery.data]);

  useEffect(() => {
    void ensureFullProfile();
  }, [ensureFullProfile]);

  useEffect(() => {
    if (!profileReady || isLoading) return;

    if (!session) {
      membershipSyncRef.current = 0;
      void navigate({ to: "/login", search: { planId: undefined } });
      return;
    }

    if (companyMemberships.length > 0) {
      membershipSyncRef.current = 0;
      return;
    }
    if (isPlatformAdmin) {
      membershipSyncRef.current = 0;
      void navigate({ to: "/master" });
      return;
    }

    // Sessão ok mas contexto ainda sem empresa (ex.: bootstrap acabou de rodar).
    if (membershipSyncRef.current < 4) {
      membershipSyncRef.current += 1;
      const delay = membershipSyncRef.current * 400;
      const t = window.setTimeout(() => void refresh(), delay);
      return () => window.clearTimeout(t);
    }

    membershipSyncRef.current = 0;
    void navigate({ to: "/onboarding/company", replace: true });
  }, [companyMemberships.length, isLoading, isPlatformAdmin, navigate, profileReady, refresh, session]);

  if (!profileReady || isLoading || !session) {
    return (
      <div className="min-h-screen bg-secondary/30">
        <div className="mx-auto flex min-h-screen max-w-md items-center justify-center px-6 text-center">
          <div className="rounded-3xl border border-border bg-card p-8 shadow-elegant">
            <Logo onLight className="mx-auto h-11 max-w-[240px]" />
            <div className="mt-4 font-display text-xl">Carregando seu painel…</div>
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
      {/* Mobile topbar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 hover:bg-accent"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
        <Logo onLight className="h-9 max-w-[160px]" />
        <AdminNotificationsBell companyId={companyId} hasCompany={hasCompany} />
      </div>

      <div className="flex">
        {/* Sidebar */}
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
          <nav className="flex max-h-[calc(100vh-12rem)] flex-col gap-1 overflow-y-auto p-3 pb-36 lg:max-h-none lg:pb-3">
            {nav.map((item) => {
              const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to as never}
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
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void signOut();
              }}
              className="mt-1 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-destructive/10 lg:hidden"
            >
              <LogOut className="size-4" />
              Sair
            </button>
          </nav>
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-gradient-to-br from-foreground to-foreground/80 p-4 text-background">
            <div className="text-xs uppercase tracking-wider text-gold">
              {subscriptionQuery.isLoading ? "…" : planSummary.title}
            </div>
            <div className="mt-1 text-sm text-background/90">
              {subscriptionQuery.isLoading ? "Carregando…" : planSummary.subtitle}
            </div>
            <Link to="/admin/plano" className="mt-3 inline-block text-xs text-gold hover:underline">
              Gerenciar plano →
            </Link>
          </div>
        </aside>

        {open && (
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-foreground/40 backdrop-blur-sm lg:hidden" />
        )}

        <main className="min-w-0 flex-1">
          <div className="hidden h-16 items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur lg:flex">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>
                Olá,{" "}
                <span className="font-medium text-foreground">
                  {studioDisplayName !== "Studio"
                    ? studioDisplayName
                    : user?.email?.split("@")[0] ?? "Equipe"}
                </span>{" "}
                ✨
              </span>
              {isPlatformAdmin && (
                <Link to="/master" className="text-xs font-medium text-gold hover:underline">
                  Painel Master
                </Link>
              )}
            </div>
            <div className="flex items-center gap-3">
              <AdminNotificationsBell companyId={companyId} hasCompany={hasCompany} />
              <button
                type="button"
                onClick={() => void signOut()}
                className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Sair
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

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl md:text-3xl font-display">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
