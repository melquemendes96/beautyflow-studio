import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { masterService } from "@/services/masterService";
import { addReadNotificationIds, getReadNotificationIds } from "@/lib/master-notification-read";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type MasterFeedItem = {
  id: string;
  kind: "payment" | "ticket";
  title: string;
  subtitle: string;
  at: string;
  href: "/master/pagamentos" | "/master/suporte";
};

function buildFeed(payments: unknown[], tickets: unknown[]): MasterFeedItem[] {
  const out: MasterFeedItem[] = [];

  for (const raw of payments) {
    const p = raw as Record<string, unknown>;
    const companies = p.companies as { name?: string } | null | undefined;
    const company = companies?.name ?? "Empresa";
    const amt = Number(p.amount ?? 0);
    const paidAt = (p.paid_at ?? p.created_at) as string;
    out.push({
      id: `pay:${String(p.id ?? "")}`,
      kind: "payment",
      title: "Pagamento confirmado",
      subtitle: `${company} · ${amt.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      at: paidAt,
      href: "/master/pagamentos",
    });
  }

  for (const raw of tickets) {
    const t = raw as Record<string, unknown>;
    const companies = t.companies as { name?: string } | null | undefined;
    const company = companies?.name ?? "Empresa";
    const subject = String(t.subject ?? "").slice(0, 120);
    out.push({
      id: `ticket:${String(t.id ?? "")}`,
      kind: "ticket",
      title: "Novo chamado de suporte",
      subtitle: `${company} · ${subject}`,
      at: String(t.created_at ?? ""),
      href: "/master/suporte",
    });
  }

  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return out.slice(0, 55);
}

export function MasterNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [readTick, setReadTick] = useState(0);
  const readIds = useMemo(() => getReadNotificationIds(), [readTick, open]);

  const feedQuery = useQuery({
    queryKey: ["master", "notification_feed"],
    queryFn: async () => {
      const [payRes, tickRes] = await Promise.all([
        masterService.listRecentPaidPayments(40),
        masterService.listRecentSupportTicketsWithCompany(40),
      ]);
      if (payRes.error) throw payRes.error;
      if (tickRes.error) throw tickRes.error;
      return {
        payments: payRes.data ?? [],
        tickets: tickRes.data ?? [],
      };
    },
    refetchInterval: 45_000,
    staleTime: 20_000,
  });

  const items = useMemo(
    () => buildFeed(feedQuery.data?.payments ?? [], feedQuery.data?.tickets ?? []),
    [feedQuery.data?.payments, feedQuery.data?.tickets],
  );

  const unreadCount = useMemo(
    () => items.filter((it) => !readIds.has(it.id)).length,
    [items, readIds],
  );

  const skipInitialToast = useRef(true);
  const toastedOnSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!items.length) return;

    if (skipInitialToast.current) {
      skipInitialToast.current = false;
      items.forEach((it) => toastedOnSession.current.add(it.id));
      return;
    }

    for (const it of items) {
      if (toastedOnSession.current.has(it.id)) continue;
      toastedOnSession.current.add(it.id);
      toast(it.title, {
        description: it.subtitle,
        duration: 6500,
        className: "animate-in fade-in slide-in-from-top-2 duration-300",
      });
    }
  }, [items]);

  const markOneRead = (id: string) => {
    addReadNotificationIds([id]);
    setReadTick((n) => n + 1);
  };

  const markAllRead = () => {
    addReadNotificationIds(items.map((i) => i.id));
    setReadTick((n) => n + 1);
    toast.message("Notificações marcadas como lidas.");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative rounded-full border border-border p-2 text-foreground transition hover:bg-accent",
            unreadCount > 0 && "animate-master-bell-shake",
          )}
          aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ""}`}
        >
          <Bell className="size-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-[1.125rem] place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(100vw-2rem,22rem)] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notificações</span>
          {items.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={markAllRead}>
              Marcar todas como lidas
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-72">
          {feedQuery.isLoading ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Carregando…</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum evento recente.</div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((it) => {
                const unread = !readIds.has(it.id);
                return (
                  <li key={it.id}>
                    <Link
                      to={it.href}
                      onClick={() => {
                        markOneRead(it.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "block px-3 py-2.5 text-left transition hover:bg-secondary/80",
                        unread && "bg-info/10",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium leading-snug">{it.title}</span>
                        {unread ? <span className="size-2 shrink-0 rounded-full bg-info" aria-hidden /> : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{it.subtitle}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(it.at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
        {feedQuery.isError ? (
          <div className="border-t border-border px-3 py-2 text-xs text-destructive">Não foi possível atualizar.</div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
