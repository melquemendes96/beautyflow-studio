import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { masterService } from "@/services/masterService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2,
  CircleDot,
  Clock3,
  LifeBuoy,
  Plus,
  Search,
  AlertTriangle,
} from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/suporte")({
  component: MasterSuporte,
});

type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
type TicketPriority = "low" | "normal" | "high" | "urgent";
type TabKey = "abertos" | "andamento" | "resolvidos" | "todos";

type TicketRow = {
  id: string;
  company_id?: string | null;
  subject?: string | null;
  message?: string | null;
  status?: string | null;
  priority?: string | null;
  protocol_code?: string | null;
  resolution_notes?: string | null;
  resolved_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  companies?: { name?: string | null; slug?: string | null } | null;
};

function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const map: Record<string, string> = {
    open: "Aberto",
    in_progress: "Em andamento",
    resolved: "Resolvido",
    closed: "Fechado",
  };
  return map[status] ?? status;
}

function statusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (status === "open") return "outline";
  if (status === "in_progress") return "default";
  if (status === "resolved") return "secondary";
  if (status === "closed") return "secondary";
  return "secondary";
}

function priorityLabel(priority: string | null | undefined): string {
  if (!priority) return "—";
  const map: Record<string, string> = {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
  };
  return map[priority] ?? priority;
}

function priorityVariant(priority: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (priority === "urgent") return "destructive";
  if (priority === "high") return "default";
  if (priority === "low") return "outline";
  return "secondary";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function protocolDisplay(t: TicketRow): string {
  if (t.protocol_code) return t.protocol_code;
  return `SUP-${String(t.id).slice(0, 8).toUpperCase()}`;
}

function isOpenPipeline(status: string | null | undefined): boolean {
  return status === "open" || status === "in_progress";
}

function MasterSuporte() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("abertos");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<TicketRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const [form, setForm] = useState({
    companyId: "",
    subject: "",
    message: "",
    priority: "normal" as TicketPriority,
  });

  const companiesQuery = useQuery({
    queryKey: ["master", "companies"],
    queryFn: async () => {
      const res = await masterService.listCompanies();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["master", "support_tickets"],
    queryFn: async () => {
      const res = await masterService.listSupportTickets();
      if (res.error) throw res.error;
      return (res.data ?? []) as TicketRow[];
    },
  });

  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      open: rows.filter((t) => t.status === "open").length,
      progress: rows.filter((t) => t.status === "in_progress").length,
      resolved: rows.filter((t) => t.status === "resolved").length,
      closed: rows.filter((t) => t.status === "closed").length,
      urgent: rows.filter((t) => t.priority === "urgent" && isOpenPipeline(t.status)).length,
      total: rows.length,
    };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = [...(data ?? [])];

    if (tab === "abertos") rows = rows.filter((t) => t.status === "open");
    else if (tab === "andamento") rows = rows.filter((t) => t.status === "in_progress");
    else if (tab === "resolvidos") {
      rows = rows.filter((t) => t.status === "resolved" || t.status === "closed");
    }

    if (priorityFilter !== "all") {
      rows = rows.filter((t) => t.priority === priorityFilter);
    }
    if (companyFilter !== "all") {
      rows = rows.filter((t) => t.company_id === companyFilter);
    }
    if (q) {
      rows = rows.filter((t) => {
        const hay = [
          t.subject,
          t.message,
          t.protocol_code,
          t.companies?.name,
          t.companies?.slug,
          protocolDisplay(t),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const rank = (t: TicketRow) => {
      const p =
        t.priority === "urgent" ? 0 : t.priority === "high" ? 1 : t.priority === "normal" ? 2 : 3;
      const s = t.status === "open" ? 0 : t.status === "in_progress" ? 1 : 2;
      return s * 10 + p;
    };
    rows.sort((a, b) => {
      if (tab === "resolvidos") {
        return String(b.resolved_at ?? b.updated_at ?? "").localeCompare(
          String(a.resolved_at ?? a.updated_at ?? ""),
        );
      }
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
    });

    return rows;
  }, [data, tab, search, priorityFilter, companyFilter]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["master", "support_tickets"] });
    await queryClient.invalidateQueries({ queryKey: ["master", "notification_feed"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const subject = form.subject.trim();
      const message = form.message.trim();
      if (!subject || !message) throw new Error("Preencha assunto e descrição.");
      const res = await masterService.createSupportTicket({
        company_id: form.companyId || null,
        subject,
        message,
        priority: form.priority,
        status: "open",
      });
      if (res.error) throw res.error;
      return res.data as TicketRow;
    },
    onSuccess: async (ticket) => {
      setCreateOpen(false);
      setForm({ companyId: "", subject: "", message: "", priority: "normal" });
      await invalidate();
      toast.success("Protocolo aberto", {
        description: `${protocolDisplay(ticket)} criado com sucesso.`,
      });
      setDetail(ticket);
      setResolutionNotes(ticket.resolution_notes ?? "");
    },
    onError: (err: any) => {
      toast.error("Não foi possível abrir o protocolo", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: {
      ticketId: string;
      patch: Parameters<typeof masterService.updateSupportTicket>[1];
      successMsg: string;
    }) => {
      let res = await masterService.updateSupportTicket(input.ticketId, input.patch);
      // Fallback se migration de protocol/notes ainda não foi aplicada
      if (res.error) {
        const msg = String((res.error as { message?: string }).message ?? "");
        if (msg.includes("resolution_notes") || msg.includes("resolved_at") || msg.includes("protocol_code")) {
          const { resolution_notes: _n, resolved_at: _r, ...safe } = input.patch;
          res = await masterService.updateSupportTicket(input.ticketId, safe);
        }
      }
      if (res.error) throw res.error;
      return { data: res.data as TicketRow, successMsg: input.successMsg };
    },
    onSuccess: async ({ data: ticket, successMsg }) => {
      await invalidate();
      toast.success(successMsg);
      setDetail(ticket);
      setResolutionNotes(ticket.resolution_notes ?? "");
    },
    onError: (err: any) => {
      toast.error("Não foi possível atualizar o protocolo", {
        description: err?.message ?? "Tente novamente.",
      });
    },
  });

  const openDetail = (t: TicketRow) => {
    setDetail(t);
    setResolutionNotes(t.resolution_notes ?? "");
  };

  const setStatus = (status: TicketStatus, successMsg: string) => {
    if (!detail) return;
    const patch: Parameters<typeof masterService.updateSupportTicket>[1] = { status };
    if (status === "resolved" || status === "closed") {
      patch.resolution_notes = resolutionNotes.trim() || null;
      patch.resolved_at = detail.resolved_at ?? new Date().toISOString();
    }
    if (status === "open" || status === "in_progress") {
      patch.resolved_at = null;
    }
    updateMutation.mutate({ ticketId: detail.id, patch, successMsg });
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "abertos", label: "Abertos", count: stats.open },
    { key: "andamento", label: "Em andamento", count: stats.progress },
    { key: "resolvidos", label: "Resolvidos", count: stats.resolved + stats.closed },
    { key: "todos", label: "Todos", count: stats.total },
  ];

  const busy = createMutation.isPending || updateMutation.isPending;

  return (
    <div>
      <MasterPageTitle
        title="Suporte"
        subtitle="Protocolos de atendimento — da abertura até a resolução."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Atualizando…" : "Atualizar"}
            </Button>
            <Button
              className="rounded-full bg-foreground text-background hover:opacity-90"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="mr-1 size-4" />
              Novo protocolo
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CircleDot}
          label="Abertos"
          value={String(stats.open)}
          hint="aguardando atendimento"
          detail="fila inicial"
          tone={stats.open > 0 ? "warn" : "default"}
        />
        <StatCard
          icon={Clock3}
          label="Em andamento"
          value={String(stats.progress)}
          hint="sendo tratados"
          detail="equipe atuando"
          tone={stats.progress > 0 ? "ok" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label="Urgentes abertos"
          value={String(stats.urgent)}
          hint="prioridade máxima"
          detail="na fila ativa"
          tone={stats.urgent > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={CheckCircle2}
          label="Resolvidos / fechados"
          value={String(stats.resolved + stats.closed)}
          hint={`${stats.resolved} resolvido(s)`}
          detail={`${stats.closed} fechado(s)`}
          tone="default"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
                  tab === t.key
                    ? "bg-foreground text-background"
                    : "border border-border bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                {t.label}
                <span className="ml-1.5 opacity-70">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-[1fr_180px_220px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar protocolo, assunto, empresa…"
                className="h-10 rounded-xl pl-9"
              />
            </label>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas prioridades</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as empresas</SelectItem>
                {(companiesQuery.data ?? []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar os protocolos.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Protocolo</th>
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Assunto</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Prioridade</th>
                <th className="px-5 py-3">Criado em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={7} />
                ))}

              {!isLoading &&
                filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-b-0">
                    <td className="px-5 py-4 font-mono text-xs font-medium text-foreground">
                      {protocolDisplay(t)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{t.companies?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{t.companies?.slug ?? ""}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-foreground">{t.subject}</div>
                      <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.message}</div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={statusVariant(t.status)}>{statusLabel(t.status)}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={priorityVariant(t.priority)}>{priorityLabel(t.priority)}</Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDateTime(t.created_at)}</td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => openDetail(t)}
                      >
                        Abrir
                      </Button>
                    </td>
                  </tr>
                ))}

              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td className="p-0" colSpan={7}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={LifeBuoy}
                        title={
                          search || priorityFilter !== "all" || companyFilter !== "all"
                            ? "Nenhum protocolo neste filtro"
                            : tab === "abertos"
                              ? "Nenhum protocolo aberto"
                              : "Nenhum protocolo nesta aba"
                        }
                        description="Abra um novo protocolo ou aguarde solicitações das empresas (checkout / plano)."
                        action={
                          <Button
                            className="rounded-full bg-foreground text-background hover:opacity-90"
                            onClick={() => setCreateOpen(true)}
                          >
                            Novo protocolo
                          </Button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Novo protocolo */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo protocolo de atendimento</DialogTitle>
            <DialogDescription>
              Registra um chamado interno ou em nome de uma empresa. O status começa como Aberto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Empresa (opcional)</span>
              <Select
                value={form.companyId || "none"}
                onValueChange={(v) => setForm((s) => ({ ...s, companyId: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem empresa vinculada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem empresa vinculada</SelectItem>
                  {(companiesQuery.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Assunto</span>
              <Input
                value={form.subject}
                onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))}
                placeholder="Ex.: Problema no pagamento / onboarding"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Descrição</span>
              <textarea
                value={form.message}
                onChange={(e) => setForm((s) => ({ ...s, message: e.target.value }))}
                rows={4}
                placeholder="Detalhe o pedido ou o problema…"
                className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-foreground"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Prioridade</span>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((s) => ({ ...s, priority: v as TicketPriority }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={busy}>
              {createMutation.isPending ? "Abrindo…" : "Abrir protocolo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detalhe / fluxo de status */}
      <Dialog
        open={Boolean(detail)}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{detail ? protocolDisplay(detail) : "Protocolo"}</DialogTitle>
            <DialogDescription>{detail?.subject}</DialogDescription>
          </DialogHeader>

          {detail ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={statusVariant(detail.status)}>{statusLabel(detail.status)}</Badge>
                <Badge variant={priorityVariant(detail.priority)}>{priorityLabel(detail.priority)}</Badge>
              </div>

              <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
                <div>
                  Empresa:{" "}
                  <span className="text-foreground">
                    {detail.companies?.name ?? "—"}
                    {detail.companies?.slug ? ` · ${detail.companies.slug}` : ""}
                  </span>
                </div>
                <div className="mt-1">Criado: {formatDateTime(detail.created_at)}</div>
                <div>Atualizado: {formatDateTime(detail.updated_at)}</div>
                {detail.resolved_at ? <div>Resolvido: {formatDateTime(detail.resolved_at)}</div> : null}
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Descrição</div>
                <p className="whitespace-pre-wrap rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  {detail.message}
                </p>
              </div>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Prioridade</span>
                <Select
                  value={(detail.priority as TicketPriority) || "normal"}
                  onValueChange={(v) =>
                    updateMutation.mutate({
                      ticketId: detail.id,
                      patch: { priority: v as TicketPriority },
                      successMsg: "Prioridade atualizada",
                    })
                  }
                  disabled={busy}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Notas de atendimento / resolução</span>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  placeholder="O que foi feito, combinações, próximo passo…"
                  className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-foreground"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit rounded-full"
                  disabled={busy}
                  onClick={() =>
                    updateMutation.mutate({
                      ticketId: detail.id,
                      patch: { resolution_notes: resolutionNotes.trim() || null },
                      successMsg: "Notas salvas",
                    })
                  }
                >
                  Salvar notas
                </Button>
              </label>

              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">Fluxo do protocolo</div>
                <div className="flex flex-wrap gap-2">
                  {detail.status === "open" ? (
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => setStatus("in_progress", "Protocolo em andamento")}
                    >
                      Assumir (em andamento)
                    </Button>
                  ) : null}
                  {detail.status === "in_progress" || detail.status === "open" ? (
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => setStatus("resolved", "Protocolo resolvido")}
                    >
                      Marcar resolvido
                    </Button>
                  ) : null}
                  {detail.status === "resolved" ? (
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => setStatus("closed", "Protocolo fechado")}
                    >
                      Fechar protocolo
                    </Button>
                  ) : null}
                  {detail.status === "closed" || detail.status === "resolved" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => setStatus("open", "Protocolo reaberto")}
                    >
                      Reabrir
                    </Button>
                  ) : null}
                  {detail.status === "in_progress" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      disabled={busy}
                      onClick={() => setStatus("open", "Voltou para aberto")}
                    >
                      Voltar para aberto
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Aberto → Em andamento → Resolvido → Fechado. Você pode reabrir se precisar.
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Fechar painel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  detail,
  tone,
}: {
  icon: typeof LifeBuoy;
  label: string;
  value: string;
  hint: string;
  detail: string;
  tone: "default" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/25 bg-amber-500/5"
        : tone === "danger"
          ? "border-destructive/25 bg-destructive/5"
          : "border-border bg-card";

  return (
    <div className={`rounded-2xl border p-4 shadow-soft ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-2 font-display text-2xl text-foreground">{value}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{hint}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}
