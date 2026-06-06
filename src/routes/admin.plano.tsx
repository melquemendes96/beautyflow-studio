import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Check, CreditCard } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminEmptyState, AdminServiceCardSkeleton, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";
import { useCurrentCompany } from "@/lib/current-company";
import { useAuth } from "@/contexts/AuthProvider";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subscriptionService } from "@/services/subscriptionService";
import { paymentService } from "@/services/paymentService";
import { useMemo, useState } from "react";
import { supportTicketService } from "@/services/supportTicketService";
import { teamService } from "@/services/teamService";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  adminMobileDialogBodyClass,
  adminMobileDialogContentClass,
  adminMobileDialogFooterClass,
  adminMobileDialogHeaderClass,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/plano")({
  component: Plano,
  validateSearch: (s: Record<string, unknown>) => ({
    checkout: typeof s.checkout === "string" ? s.checkout : undefined,
    billing: typeof s.billing === "string" ? s.billing : undefined,
    need: typeof s.need === "string" ? s.need : undefined,
  }),
});

function Plano() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isCheckoutChild =
    pathname === "/admin/plano/checkout" || pathname.startsWith("/admin/plano/checkout/");

  const { companyId, hasCompany } = useCurrentCompany();
  const { isPlatformAdmin } = useAuth();
  const { checkout, billing, need } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isCheckoutChild) return;
    if (!checkout) return;
    if (checkout === "success") {
      toast.success("Plano ativado. Sua assinatura foi atualizada com sucesso.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      if (companyId) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "notification_feed", companyId] });
      }
    } else if (checkout === "failure") {
      toast.error("O pagamento não foi concluído. Tente novamente ou escolha outro método.");
    } else if (checkout === "pending") {
      toast.message("Pagamento pendente. Estamos aguardando a confirmação — sua assinatura será ativada em instantes.");
    } else if (checkout === "cancel") {
      toast.message("Checkout encerrado sem pagamento. Você pode tentar de novo quando quiser.");
    }
    void navigate({ to: "/admin/plano", search: { checkout: undefined, billing: undefined, need: undefined }, replace: true });
  }, [checkout, navigate, queryClient, isCheckoutChild, companyId]);

  useEffect(() => {
    if (isCheckoutChild) return;
    if (!billing) return;
    if (billing === "suspended") {
      toast.error("Conta suspensa: regularize o pagamento para liberar o painel completo.");
    } else if (billing === "renew") {
      toast.message("Assinatura em atraso ou inativa. Escolha um plano abaixo para renovar.");
    } else if (billing === "expired") {
      toast.message("Período da assinatura encerrado. Renove para continuar com acesso completo.");
    } else if (billing === "setup") {
      toast.message("Ative ou escolha um plano para liberar todas as áreas do painel.");
    } else if (billing === "upgrade") {
      toast.message(
        need
          ? `Seu plano atual não inclui ${need}. Faça upgrade para o Studio Pro ou Elite Beauty.`
          : "Faça upgrade de plano para liberar este recurso.",
      );
    }
    void navigate({ to: "/admin/plano", search: { billing: undefined, checkout: undefined, need: undefined }, replace: true });
  }, [billing, need, navigate, isCheckoutChild]);

  const [openTicket, setOpenTicket] = useState(false);
  const [ticket, setTicket] = useState({
    subject: "Solicitação financeira",
    message: "",
    priority: "normal" as "low" | "normal" | "high",
  });

  const plansQuery = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: async () => {
      const res = await subscriptionService.listPlans();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const subscriptionQuery = useQuery({
    queryKey: ["admin", "subscription", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await subscriptionService.getSubscriptionByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const paymentsQuery = useQuery({
    queryKey: ["admin", "payments", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await subscriptionService.listPaymentsByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const pendingPayment = useMemo(() => {
    const list = (paymentsQuery.data ?? []) as { id?: string; status?: string }[];
    return list.find((p) => String(p.status ?? "") === "pending") ?? null;
  }, [paymentsQuery.data]);

  const simulateMutation = useMutation({
    mutationFn: async (outcome: "approved" | "pending" | "failed") => {
      if (!pendingPayment?.id) throw new Error("Nenhuma cobrança pendente.");
      const res = await paymentService.simulateCompanyPaymentOutcome(pendingPayment.id, outcome);
      if (res.error) throw res.error;
      const payload = res.data as { ok?: boolean; error?: string; outcome?: string };
      if (payload?.ok === false) {
        const code = String(payload.error ?? "");
        if (code === "simulacao_nao_disponivel") {
          throw new Error("Simulação indisponível para contas de empresa.");
        }
        throw new Error("Não foi possível concluir a simulação.");
      }
      return payload;
    },
    onSuccess: async (payload) => {
      const o = String(payload?.outcome ?? "");
      if (o === "approved" || o === "already_paid") {
        toast.success("Pagamento aprovado (simulação). Sua assinatura está ativa.");
      } else if (o === "failed") {
        toast.error("Pagamento recusado (simulação). Escolha outro método ou tente de novo.");
      } else {
        toast.message("Pagamento permanece pendente (simulação).");
      }
      await queryClient.invalidateQueries({ queryKey: ["admin", "subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "payments"] });
      if (companyId) {
        await queryClient.invalidateQueries({ queryKey: ["admin", "notification_feed", companyId] });
      }
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Não foi possível simular o pagamento.";
      toast.error(msg);
    },
  });

  const createTicketMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      const subject = ticket.subject.trim();
      const message = ticket.message.trim();
      if (!subject || !message) throw new Error("Campos obrigatórios");
      const res = await supportTicketService.createByCompany({
        companyId,
        subject,
        message,
        priority: ticket.priority,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Solicitação enviada ao suporte");
      setOpenTicket(false);
      setTicket({ subject: "Solicitação financeira", message: "", priority: "normal" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "support_tickets", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "notification_feed", companyId] });
    },
    onError: () => {
      toast.error("Não foi possível enviar sua solicitação.");
    },
  });

  const current = useMemo(() => {
    const s = subscriptionQuery.data as {
      status?: string | null;
      plan_id?: string | null;
      current_period_end?: string | null;
      plans?: { id?: string; name?: string | null; price?: number | null } | null | unknown[];
    } | null;
    if (!s) return null;
    const rawPlan = s.plans;
    const p = Array.isArray(rawPlan) ? rawPlan[0] : rawPlan;
    const planId = String((p as { id?: string } | undefined)?.id ?? s.plan_id ?? "");
    if (!planId) return null;
    const end = s.current_period_end ? new Date(s.current_period_end) : null;
    const days = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
    return {
      planId,
      name: (p && typeof p === "object" && "name" in p && typeof (p as { name?: string }).name === "string"
        ? (p as { name: string }).name
        : null) ?? "Plano",
      price: p && typeof p === "object" && "price" in p ? Number((p as { price?: number }).price ?? 0) : 0,
      status: String(s.status ?? "active"),
      periodEnd: end,
      daysToRenew: days,
    };
  }, [subscriptionQuery.data]);

  const isElitePlan = (current?.name ?? "").toLowerCase().includes("elite");

  const teamSlotsQuery = useQuery({
    queryKey: ["admin", "team", "slots", companyId],
    enabled: hasCompany && Boolean(companyId) && isElitePlan,
    queryFn: async () => {
      const res = await teamService.list(companyId!);
      if (res.error) throw res.error;
      if (!res.data?.ok) throw new Error(res.data?.error ?? "Erro ao carregar equipe");
      return res.data;
    },
  });

  const statusPt = (st: string) => {
    if (st === "active") return "Ativa";
    if (st === "trialing") return "Teste";
    if (st === "past_due") return "Inadimplente";
    if (st === "paused") return "Pausada";
    if (st === "canceled") return "Cancelada";
    return st;
  };

  const paymentStatusPt = (st: string) => {
    if (st === "paid") return "Pago";
    if (st === "pending") return "Pendente";
    if (st === "failed") return "Recusado";
    if (st === "refunded") return "Estornado";
    return st;
  };

  if (isCheckoutChild) {
    return <Outlet />;
  }

  return (
    <div>
      <PageTitle title="Plano e assinatura" subtitle="Gerencie seu plano e método de pagamento" />

      {plansQuery.isError && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar os planos disponíveis. Atualize a página ou tente mais tarde.
        </div>
      )}
      {subscriptionQuery.isError && hasCompany && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar os dados da sua assinatura.
        </div>
      )}
      {paymentsQuery.isError && hasCompany && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar o histórico de cobranças.
        </div>
      )}

      <div className="mb-8 rounded-2xl border border-gold/30 bg-gradient-to-br from-foreground to-foreground/90 p-6 text-background shadow-elegant">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-gold">Plano atual</div>
            {subscriptionQuery.isLoading && hasCompany ? (
              <>
                <Skeleton className="mt-2 h-9 w-48 max-w-full bg-white/15" />
                <Skeleton className="mt-2 h-4 w-full max-w-md bg-white/10" />
              </>
            ) : (
              <>
                <div className="mt-1 font-display text-3xl">
                  {current?.name ?? "Sem assinatura"}
                </div>
                <div className="text-sm text-background/70">
                  {current
                    ? `R$ ${current.price.toFixed(2).replace(".", ",")}/mês · ${statusPt(current.status)}${
                        current.daysToRenew != null ? ` · Renova em ${current.daysToRenew} dias` : ""
                      }`
                    : hasCompany
                      ? "Escolha um plano abaixo para ativar sua assinatura ou iniciar o teste."
                      : "Associe-se a uma empresa para ver o plano."}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {current?.planId ? (
              <>
                <Link
                  to="/admin/plano/checkout"
                  search={{ planId: current.planId, trial: false, checkout: undefined, billing: undefined }}
                  className="rounded-full border border-background/20 px-5 py-2.5 text-sm hover:bg-background/10"
                >
                  Atualizar pagamento
                </Link>
                <Link
                  to="/admin/plano/checkout"
                  search={{ planId: current.planId, trial: false, checkout: undefined, billing: undefined }}
                  className="rounded-full bg-gold px-5 py-2.5 text-sm text-foreground hover:opacity-90"
                >
                  Renovar / checkout
                </Link>
              </>
            ) : (
              <span className="text-sm text-background/60">Escolha um plano abaixo para assinar.</span>
            )}
          </div>
        </div>
      </div>

      {isElitePlan && hasCompany ? (
        <div className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-lg">Equipe no agendamento online</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O plano Elite inclui <strong>3 prestadores</strong> bookáveis (dono/conta como 1 vaga). Renovar o plano
            mantém o Elite — não adiciona vagas extras automaticamente.
          </p>
          {teamSlotsQuery.isLoading ? (
            <Skeleton className="mt-4 h-4 w-48" />
          ) : teamSlotsQuery.isError ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Não foi possível ler o uso de vagas. Veja em{" "}
              <Link to="/admin/equipe" className="underline hover:text-foreground">
                Equipe
              </Link>
              .
            </p>
          ) : (
            <p className="mt-4 text-sm">
              Uso atual:{" "}
              <span className="font-medium">
                {teamSlotsQuery.data?.active_count ?? 0}/{teamSlotsQuery.data?.slot_limit ?? 3} vagas ativas
              </span>
              {(teamSlotsQuery.data?.slot_limit ?? 0) <= 0 ? (
                <span className="mt-2 block text-amber-700">
                  Limite zerado no sistema — aplique a correção no Supabase ou fale com o suporte.
                </span>
              ) : null}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Vagas extras de prestador (R$ 17/mês cada) serão contratadas como add-on em breve. Enquanto isso, use
            &quot;Falar com suporte&quot; abaixo para solicitar.
          </p>
          <Link
            to="/admin/equipe"
            className="mt-4 inline-flex rounded-full border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Gerenciar equipe →
          </Link>
        </div>
      ) : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-lg">Detalhes da assinatura</h2>
          <div className="mt-4 grid gap-2 text-sm">
            {subscriptionQuery.isLoading && hasCompany ? (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex justify-between gap-4">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </>
            ) : (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium">{current ? statusPt(current.status) : "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Renovação</span>
                  <span className="font-medium">
                    {current?.periodEnd ? current.periodEnd.toLocaleDateString("pt-BR") : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-medium">
                    {current ? `R$ ${current.price.toFixed(2).replace(".", ",")}/mês` : "—"}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            Pagamentos online (PIX, cartão, boleto) passam pelo Mercado Pago. O Master continua podendo registrar cobranças manuais quando necessário.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Dialog open={openTicket} onOpenChange={setOpenTicket}>
              <DialogTrigger asChild>
                <Button className="rounded-full">Solicitar suporte financeiro</Button>
              </DialogTrigger>
              <DialogContent className={adminMobileDialogContentClass}>
                <DialogHeader className={adminMobileDialogHeaderClass}>
                  <DialogTitle>Solicitar suporte financeiro</DialogTitle>
                  <DialogDescription>
                    Envie uma solicitação para o time da plataforma (Master) tratar sua renovação/pagamento.
                  </DialogDescription>
                </DialogHeader>

                <div className={adminMobileDialogBodyClass}>
                  <div className="grid gap-3">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Assunto</span>
                      <Input value={ticket.subject} onChange={(e) => setTicket((s) => ({ ...s, subject: e.target.value }))} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Mensagem</span>
                      <Input value={ticket.message} onChange={(e) => setTicket((s) => ({ ...s, message: e.target.value }))} placeholder="Descreva sua solicitação" />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Prioridade</span>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={ticket.priority}
                        onChange={(e) => setTicket((s) => ({ ...s, priority: e.target.value as any }))}
                      >
                        <option value="low">Baixa</option>
                        <option value="normal">Normal</option>
                        <option value="high">Alta</option>
                      </select>
                    </label>
                  </div>
                </div>

                <DialogFooter className={adminMobileDialogFooterClass}>
                  <Button variant="outline" onClick={() => setOpenTicket(false)} disabled={createTicketMutation.isPending}>
                    Cancelar
                  </Button>
                  <Button onClick={() => createTicketMutation.mutate()} disabled={createTicketMutation.isPending}>
                    {createTicketMutation.isPending ? "Enviando…" : "Enviar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-lg">Cobranças</h2>
          <p className="mt-1 text-sm text-muted-foreground">Histórico das últimas cobranças geradas para sua empresa.</p>
          <div className="-mx-1 mt-4 overflow-x-auto px-1 sm:mx-0 sm:px-0">
            <div className="overflow-hidden rounded-2xl border border-border">
              <table className="w-full min-w-[320px] text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Vencimento</th>
                    <th className="px-4 py-3 text-left">Valor</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paymentsQuery.isLoading &&
                    Array.from({ length: 4 }).map((_, i) => <AdminTableRowSkeleton key={`pay-sk-${i}`} cols={3} />)}
                  {!paymentsQuery.isLoading &&
                    (paymentsQuery.data ?? []).slice(0, 8).map((p: any) => (
                      <tr key={p.id} className="hover:bg-accent/40 transition">
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.due_date ? new Date(p.due_date).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          R$ {Number(p.amount ?? 0).toFixed(2).replace(".", ",")}
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                            {paymentStatusPt(p.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  {!paymentsQuery.isLoading && (paymentsQuery.data ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                        Nenhuma cobrança encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {import.meta.env.DEV &&
        hasCompany &&
        subscriptionQuery.data &&
        !pendingPayment &&
        String(subscriptionQuery.data.status ?? "") === "trialing" && (
          <div className="mb-8 rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
            No período de teste não há cobrança pendente. Para testar a simulação de pagamento, finalize um checkout{" "}
            <strong className="text-foreground">sem</strong> usar &quot;Iniciar teste&quot; (fluxo pago gera uma cobrança
            pendente).
          </div>
        )}

      {import.meta.env.DEV && isPlatformAdmin && hasCompany && pendingPayment && (
        <div className="mb-8 rounded-2xl border border-dashed border-gold/40 bg-gold-soft/10 p-6 shadow-soft">
          <h2 className="font-display text-lg text-foreground">Pagamento simulado (demonstração)</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enquanto o gateway real (Mercado Pago, Asaas, etc.) não finaliza a cobrança, você pode simular o resultado
            da cobrança pendente para testar o fluxo de liberação do painel.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              className="rounded-full bg-foreground text-background hover:opacity-90"
              disabled={simulateMutation.isPending}
              onClick={() => simulateMutation.mutate("approved")}
            >
              Aprovar pagamento
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={simulateMutation.isPending}
              onClick={() => simulateMutation.mutate("pending")}
            >
              Manter pendente
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-full"
              disabled={simulateMutation.isPending}
              onClick={() => simulateMutation.mutate("failed")}
            >
              Simular recusa
            </Button>
          </div>
        </div>
      )}

      <div id="planos" className="grid gap-6 md:grid-cols-3">
        {plansQuery.isLoading &&
          Array.from({ length: 3 }).map((_, i) => <AdminServiceCardSkeleton key={`plan-sk-${i}`} />)}
        {!plansQuery.isLoading && (plansQuery.data ?? []).length === 0 && (
          <div className="md:col-span-3">
            <AdminEmptyState
              icon={CreditCard}
              title="Nenhum plano disponível"
              description="Não há planos ativos cadastrados na plataforma. O administrador Master precisa criar planos em /master/planos."
            />
          </div>
        )}
        {!plansQuery.isLoading &&
          (plansQuery.data ?? []).map((p: any) => (
          <div
            key={p.id}
            className={`relative cursor-pointer rounded-3xl border p-6 shadow-soft transition hover:shadow-elegant ${
              current?.planId === p.id ? "border-gold/50 bg-gold-soft/10" : "border-border bg-card"
            }`}
            onClick={() =>
              navigate({
                to: "/admin/plano/checkout",
                search: { planId: String(p.id), trial: false, checkout: undefined, billing: undefined },
              })
            }
          >
            {current?.planId === p.id && (
              <span className="absolute right-4 top-4 rounded-full bg-success/15 px-2.5 py-1 text-[10px] text-success">Atual</span>
            )}
            <h3 className="font-display text-xl">{p.name}</h3>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-3xl">
                R$ {Number(p.price ?? 0).toFixed(2).replace(".", ",")}
              </span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              {(p.features ?? []).slice(0, 5).map((f: string) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 text-success shrink-0" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/admin/plano/checkout"
              search={{ planId: String(p.id), trial: false, checkout: undefined, billing: undefined }}
              className="mt-6 inline-flex w-full items-center justify-center rounded-full border border-foreground py-2.5 text-sm font-medium hover:bg-foreground hover:text-background transition"
              onClick={(e) => e.stopPropagation()}
            >
              {current?.planId === p.id
                ? "Atualizar pagamento"
                : Number(p.price ?? 0) > (current?.price ?? 0)
                  ? "Upgrade"
                  : "Downgrade"}
            </Link>

            {!current && (
              <Link
                to="/admin/plano/checkout"
                search={{ planId: String(p.id), trial: true, checkout: undefined, billing: undefined }}
                className="mt-2 inline-flex w-full items-center justify-center rounded-full bg-foreground py-2.5 text-sm font-medium text-background hover:opacity-90 transition"
                onClick={(e) => e.stopPropagation()}
              >
                Iniciar teste
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
