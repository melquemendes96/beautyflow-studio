import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import {
  LayoutDashboard, Calendar, Users, Scissors, Clock, BarChart3,
  Palette, MessageCircle, CreditCard, Settings, Menu, X, Bell,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const nav: NavItem[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/agenda", label: "Agenda", icon: Calendar },
  { to: "/admin/clientes", label: "Clientes", icon: Users },
  { to: "/admin/servicos", label: "Serviços", icon: Scissors },
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

  return (
    <div className="min-h-screen bg-secondary/30">
      {/* Mobile topbar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-accent">
          <Menu className="size-5" />
        </button>
        <Logo className="h-8" />
        <button className="rounded-lg p-2 hover:bg-accent"><Bell className="size-5" /></button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-sidebar-border bg-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
            <Logo className="h-9" />
            <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-accent lg:hidden">
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
          </nav>
          <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-gradient-to-br from-foreground to-foreground/80 p-4 text-background">
            <div className="text-xs uppercase tracking-wider text-gold">Plano Studio Pro</div>
            <div className="mt-1 text-sm">Renova em 12 dias</div>
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
            <div className="text-sm text-muted-foreground">
              Olá, <span className="text-foreground font-medium">Joyce</span> ✨
            </div>
            <div className="flex items-center gap-3">
              <button className="rounded-full p-2 hover:bg-accent"><Bell className="size-5" /></button>
              <div className="size-9 rounded-full bg-gradient-to-br from-gold to-gold-soft text-background grid place-items-center text-sm font-medium">
                JM
              </div>
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
