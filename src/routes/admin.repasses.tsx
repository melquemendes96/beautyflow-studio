import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { useCurrentCompany } from "@/lib/current-company";
import { payoutService, type ProviderPayoutRow } from "@/services/payoutService";
import { teamService } from "@/services/teamService";
import { formatTabMoney, PAYMENT_METHODS } from "@/services/tabService";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HandCoins, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/admin/repasses")({
  component: Repasses,
});

function toYmd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Repasses() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany, isOwnerAdmin, isProvider, providerId } = useCurrentCompany();
  const monthStart = useMemo(() => {
    const d = new Date();
    return toYmd(new Date(d.getFullYear(), d.getMonth(), 1));
  }, []);
  const today = useMemo(() => toYmd(new Date()), []);

  const [providerIdAdmin, setProviderIdAdmin] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStart);
  const [periodEnd, setPeriodEnd] = useState(today);

  const teamQuery = useQuery({
    queryKey: ["admin", "team", companyId],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: async () => {
      const res = await teamService.list(companyId!);
      if (res.error) throw new Error(String((res.error as { message?: string }).message ?? "Equipe indisponível"));
      if (res.data?.ok === false) throw new Error(res.data.error ?? "Equipe indisponível");
      return res.data?.providers ?? [];
    },
  });

  const providers = useMemo(
    () => (teamQuery.data ?? []).filter((p) => p.active && !p.is_owner),
    [teamQuery.data],
  );

  const selectedProviderId = isProvider
    ? providerId ?? ""
    : providerIdAdmin || providers[0]?.id || "";

  const balanceQuery = useQuery({
    queryKey: ["admin", "payout-balance", companyId, selectedProviderId, periodStart, periodEnd],
    enabled: hasCompany && Boolean(companyId) && Boolean(selectedProviderId),
    queryFn: async () => {
      const res = await payoutService.getBalance(companyId!, selectedProviderId, periodStart, periodEnd);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res;
    },
    retry: false,
  });

  const payoutsQuery = useQuery({
    queryKey: ["admin", "payouts", companyId, isProvider ? selectedProviderId : "all"],
    enabled: hasCompany && Boolean(companyId) && (isOwnerAdmin || Boolean(selectedProviderId)),
    queryFn: async () => {
      const res = await payoutService.listPayouts(
        companyId!,
        isProvider ? selectedProviderId : null,
      );
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res.payouts;
    },
    retry: false,
  });

  const invalidatePayouts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "payouts", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["admin", "payout-balance", companyId] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !selectedProviderId) throw new Error("Selecione um prestador");
      const res = await payoutService.createPayout(companyId, selectedProviderId, periodStart, periodEnd);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res;
    },
    onSuccess: async (res) => {
      toast.success(`Repasse de ${formatTabMoney(res.amount)} criado — aguardando pagamento`);
      await invalidatePayouts();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await payoutService.markPaid(companyId, payoutId);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res;
    },
    onSuccess: async () => {
      toast.success("Repasse marcado como pago");
      await invalidatePayouts();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await payoutService.cancelPayout(companyId, payoutId);
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res;
    },
    onSuccess: async () => {
      toast.success("Repasse cancelado — saldo liberado");
      await invalidatePayouts();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const balance = balanceQuery.data;
  const rpcMissing =
    balanceQuery.error instanceof Error &&
    (balanceQuery.error.message.includes("rpc_ausente") ||
      balanceQuery.error.message.includes("PGRST202") ||
      balanceQuery.error.message.includes("Could not find"));

  const pageTitle = isProvider ? "Meus repasses" : "Repasses";
  const pageSubtitle = isProvider
    ? "Acompanhe suas comissões e o histórico de pagamentos do salão"
    : "Comissões de serviços (comanda) + produtos vendidos";

  return (
    <div>
      <PageTitle title={pageTitle} subtitle={pageSubtitle} />

      {(rpcMissing || payoutsQuery.error) && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Repasses indisponíveis no banco</p>
            <p className="mt-1 text-muted-foreground">
              Peça ao administrador para aplicar as migrations de repasses no Supabase.
            </p>
          </div>
        </div>
      )}

      {isProvider && !providerId ? (
        <p className="mb-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Seu perfil de prestador ainda não está vinculado. Entre em contato com o administrador do salão.
        </p>
      ) : isOwnerAdmin && teamQuery.isError ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-destructive">
          Não foi possível carregar a equipe.
        </p>
      ) : isOwnerAdmin && providers.length === 0 && !teamQuery.isLoading ? (
        <p className="mb-6 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Cadastre prestadores em Equipe (exceto o perfil owner) para gerar repasses.
        </p>
      ) : (
        <div className="mb-6 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft lg:grid-cols-2">
          {isOwnerAdmin ? (
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Prestador</span>
              <Select value={selectedProviderId || undefined} onValueChange={setProviderIdAdmin}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          <div className={`grid grid-cols-2 gap-3 ${isOwnerAdmin ? "" : "lg:col-span-2"}`}>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Início</span>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Fim</span>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </label>
          </div>

          {balanceQuery.isLoading ? (
            <p className="lg:col-span-2 text-sm text-muted-foreground">Calculando saldo…</p>
          ) : balanceQuery.isError ? (
            <p className="lg:col-span-2 text-sm text-destructive">
              {balanceQuery.error instanceof Error ? balanceQuery.error.message : "Erro ao calcular saldo."}
            </p>
          ) : balance ? (
            <>
              <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="Comissão serviços" value={formatTabMoney(balance.service_commission)} />
                <Stat label="Comissão produtos" value={formatTabMoney(balance.product_commission)} />
                <Stat label="Já pago" value={formatTabMoney(balance.paid)} />
                <Stat label="Pendente" value={formatTabMoney(balance.pending ?? 0)} />
                <Stat
                  label={isProvider ? "A receber" : "Saldo disponível"}
                  value={formatTabMoney(balance.balance)}
                  highlight
                />
              </div>
              <p className="lg:col-span-2 text-xs text-muted-foreground">
                {isProvider
                  ? "Valores do período selecionado. Repasses pendentes já estão descontados do saldo a receber."
                  : "Saldo = comissões do período − repasses pagos − repasses pendentes. Só é possível um repasse pendente por prestador."}
              </p>
            </>
          ) : null}

          {isOwnerAdmin ? (
            <div className="lg:col-span-2">
              <Button
                type="button"
                className="rounded-full"
                disabled={
                  createMutation.isPending ||
                  !balance ||
                  balance.balance <= 0 ||
                  Boolean(balance.pending && balance.pending > 0)
                }
                onClick={() => createMutation.mutate()}
              >
                <HandCoins className="size-4" />
                {createMutation.isPending ? "Gerando…" : "Gerar repasse do saldo"}
              </Button>
              {balance && (balance.pending ?? 0) > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Há repasse pendente — marque como pago ou cancele antes de gerar outro.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <h2 className="mb-3 font-display text-lg">Histórico</h2>
      {payoutsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando repasses…</p>
      ) : payoutsQuery.isError ? (
        <p className="text-sm text-destructive">
          {payoutsQuery.error instanceof Error ? payoutsQuery.error.message : "Erro ao carregar histórico."}
        </p>
      ) : (payoutsQuery.data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          {isProvider
            ? "Nenhum repasse registrado para você ainda."
            : "Nenhum repasse registrado ainda."}
        </p>
      ) : (
        <ul className="space-y-3">
          {(payoutsQuery.data ?? []).map((p) => (
            <PayoutRow
              key={p.id}
              payout={p}
              readOnly={isProvider}
              onMarkPaid={() => markPaidMutation.mutate(p.id)}
              onCancel={() => cancelMutation.mutate(p.id)}
              busy={markPaidMutation.isPending || cancelMutation.isPending}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${highlight ? "bg-gold-soft/30" : "bg-secondary/50"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-xl">{value}</div>
    </div>
  );
}

function PayoutRow({
  payout,
  readOnly,
  onMarkPaid,
  onCancel,
  busy,
}: {
  payout: ProviderPayoutRow;
  readOnly?: boolean;
  onMarkPaid: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const statusLabel =
    payout.status === "paid"
      ? "Pago"
      : payout.status === "pending"
        ? "Pendente"
        : payout.status === "cancelled"
          ? "Cancelado"
          : payout.status;

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {!readOnly ? <div className="font-medium">{payout.provider_name}</div> : null}
        <div className={`text-xs text-muted-foreground ${readOnly ? "" : "mt-0.5"}`}>
          {payout.period_start} – {payout.period_end}
          {" · "}
          Serviços {formatTabMoney(payout.service_commission)}
          {" · "}
          Produtos {formatTabMoney(payout.product_commission)}
        </div>
        {readOnly && payout.paid_at ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Pago em {new Date(payout.paid_at).toLocaleDateString("pt-BR")}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-lg">{formatTabMoney(payout.amount)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${
            payout.status === "paid"
              ? "bg-success/15 text-success"
              : payout.status === "cancelled"
                ? "bg-muted text-muted-foreground"
                : "bg-info/15 text-info"
          }`}
        >
          {statusLabel}
          {payout.payment_method && payout.status === "paid"
            ? ` · ${PAYMENT_METHODS.find((m) => m.value === payout.payment_method)?.label ?? payout.payment_method}`
            : ""}
        </span>
        {!readOnly && payout.status === "pending" ? (
          <>
            <Button type="button" size="sm" className="rounded-full" disabled={busy} onClick={onMarkPaid}>
              <CheckCircle2 className="size-3.5" />
              Marcar pago
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={onCancel}>
              <XCircle className="size-3.5" />
              Cancelar
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}
