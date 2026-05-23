import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { formatAppointmentDateYmd, formatAppointmentTimeHm } from "@/lib/appointment-time";
import { appointmentService } from "@/services/appointmentService";
import { paymentService } from "@/services/paymentService";
import { supportTicketService } from "@/services/supportTicketService";
import { addReadAdminNotificationIds, getReadAdminNotificationIds } from "@/lib/admin-notification-read";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type AdminFeedItem = {
  id: string;
  kind: "payment" | "ticket" | "booking";
  title: string;
  subtitle: string;
  at: string;
  href?: string;
};

function buildAdminFeed(payments: unknown[], tickets: unknown[], appointments: unknown[]): AdminFeedItem[] {
  const out: AdminFeedItem[] = [];

  for (const raw of appointments) {
    const a = raw as Record<string, unknown>;
    const client = a.client as Record<string, unknown> | null | undefined;
    const service = a.service as Record<string, unknown> | null | undefined;
    const dateYmd = formatAppointmentDateYmd(a.appointment_date);
    const timeHm = formatAppointmentTimeHm(a.appointment_time);
    const clientName = String(client?.name ?? "Cliente");
    const serviceName = String(service?.name ?? "Serviço");
    const dateLabel = dateYmd
      ? new Date(`${dateYmd}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      : "";
    out.push({
      id: `appt:${String(a.id ?? "")}`,
      kind: "booking",
      title: "Novo agendamento recebido",
      subtitle: `${clientName} · ${serviceName}${dateLabel && timeHm ? ` · ${dateLabel} ${timeHm}` : ""}`,
      at: String(a.created_at ?? ""),
      href: "/admin/agenda",
    });
  }

  for (const raw of payments) {
    const p = raw as Record<string, unknown>;
    const amt = Number(p.amount ?? 0);
    const paidAt = (p.paid_at ?? p.created_at) as string;
    out.push({
      id: `pay:${String(p.id ?? "")}`,
      kind: "payment",
      title: "Pagamento confirmado",
      subtitle: amt.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
      at: paidAt,
    });
  }

  for (const raw of tickets) {
    const t = raw as Record<string, unknown>;
    const subject = String(t.subject ?? "").slice(0, 160);
    out.push({
      id: `ticket:${String(t.id ?? "")}`,
      kind: "ticket",
      title: "Chamado de suporte",
      subtitle: subject || "Sem assunto",
      at: String(t.created_at ?? ""),
    });
  }

  out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return out.slice(0, 55);
}

type AdminNotificationsBellProps = {
  companyId: string | null;
  hasCompany: boolean;
};

export function AdminNotificationsBell({ companyId, hasCompany }: AdminNotificationsBellProps) {
  const [open, setOpen] = useState(false);
  const [readTick, setReadTick] = useState(0);

  const readIds = useMemo(() => {
    if (!companyId) return new Set<string>();
    return getReadAdminNotificationIds(companyId);
  }, [companyId, readTick, open]);

  const feedQuery = useQuery({
    queryKey: ["admin", "notification_feed", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const cid = companyId!;
      const [payRes, tickRes, apptRes] = await Promise.all([
        paymentService.listRecentPaidForCompany(cid, 40),
        supportTicketService.listRecentForCompany(cid, 40),
        appointmentService.listRecentByCompany(cid, 40),
      ]);
      if (payRes.error) throw payRes.error;
      if (tickRes.error) throw tickRes.error;
      if (apptRes.error) throw apptRes.error;
      return {
        payments: payRes.data ?? [],
        tickets: tickRes.data ?? [],
        appointments: apptRes.data ?? [],
      };
    },
    refetchInterval: 45_000,
    staleTime: 20_000,
  });

  const items = useMemo(
    () =>
      buildAdminFeed(
        feedQuery.data?.payments ?? [],
        feedQuery.data?.tickets ?? [],
        feedQuery.data?.appointments ?? [],
      ),
    [feedQuery.data?.payments, feedQuery.data?.tickets, feedQuery.data?.appointments],
  );

  const unreadCount = useMemo(
    () => items.filter((it) => !readIds.has(it.id)).length,
    [items, readIds],
  );

  const skipInitialToast = useRef(true);
  const toastedOnSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!companyId || !items.length) return;

    if (skipInitialToast.current) {
      skipInitialToast.current = false;
      items.forEach((it) => toastedOnSession.current.add(`${companyId}:${it.id}`));
      return;
    }

    for (const it of items) {
      const key = `${companyId}:${it.id}`;
      if (toastedOnSession.current.has(key)) continue;
      toastedOnSession.current.add(key);
      toast(it.title, {
        description: it.subtitle,
        duration: 6500,
        className: "animate-in fade-in slide-in-from-top-2 duration-300",
      });
    }
  }, [companyId, items]);

  useEffect(() => {
    skipInitialToast.current = true;
    toastedOnSession.current = new Set();
  }, [companyId]);

  const markOneRead = (id: string) => {
    if (!companyId) return;
    addReadAdminNotificationIds(companyId, [id]);
    setReadTick((n) => n + 1);
  };

  const markAllRead = () => {
    if (!companyId) return;
    addReadAdminNotificationIds(
      companyId,
      items.map((i) => i.id),
    );
    setReadTick((n) => n + 1);
    toast.message("Notificações marcadas como lidas.");
  };

  if (!hasCompany || !companyId) {
    return (
      <button
        type="button"
        className="rounded-full border border-border p-2 text-muted-foreground opacity-50"
        disabled
        aria-label="Notificações indisponíveis"
      >
        <Bell className="size-5" />
      </button>
    );
  }

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
      <PopoverContent
        align="end"
        className="flex w-[min(100vw-2rem,22rem)] max-h-[min(24rem,85vh)] flex-col overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notificações da empresa</span>
          {items.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={markAllRead}>
              Marcar todas como lidas
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
                      to={it.href ?? "/admin/plano"}
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
        </div>
        {feedQuery.isError ? (
          <div className="shrink-0 border-t border-border px-3 py-2 text-xs text-destructive">
            Não foi possível atualizar.
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
