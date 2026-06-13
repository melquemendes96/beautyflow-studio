import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { PageTitle } from "@/components/admin/AdminShell";
import { ComandaDrawer } from "@/components/admin/ComandaDrawer";
import { useCurrentCompany } from "@/lib/current-company";
import { formatTabError, formatTabMoney, tabService, PAYMENT_METHODS, type ClientTabListRow } from "@/services/tabService";
import { cashExpectedForMethod, cashService, type CashCountInput } from "@/services/cashService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Receipt, Wallet, Lock, Unlock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/comandas")({
  component: Comandas,
});

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const tabStatusClass: Record<string, string> = {
  open: "bg-info/15 text-info",
  closed: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

const tabStatusLabel: Record<string, string> = {
  open: "Aberta",
  closed: "Fechada",
  cancelled: "Cancelada",
};

function Comandas() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany, isOwnerAdmin } = useCurrentCompany();
  const [day, setDay] = useState<Date>(new Date());
  const [drawerApptId, setDrawerApptId] = useState<string | null>(null);
  const [openCashOpen, setOpenCashOpen] = useState(false);
  const [closeCashOpen, setCloseCashOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("");
  const [cashCounts, setCashCounts] = useState<Record<string, string>>({});
  const [closeNotes, setCloseNotes] = useState("");

  const cashQuery = useQuery({
    queryKey: ["admin", "cash-register", companyId],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: () => cashService.getStatus(companyId!),
    staleTime: 10_000,
  });

  const cashOpen = Boolean(cashQuery.data);

  const openCashMutation = useMutation({
    mutationFn: async () => {
      const float = Number(openingFloat.replace(",", "."));
      if (!Number.isFinite(float) || float < 0) throw new Error("Informe um fundo de caixa válido (use 0 se não houver troco).");
      return cashService.openSession(companyId!, float);
    },
    onSuccess: async (res) => {
      toast.success(`Caixa aberto · fundo ${formatTabMoney(res.opening_float)}`);
      setOpenCashOpen(false);
      setOpeningFloat("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "cash-register", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeCashMutation = useMutation({
    mutationFn: async () => {
      const session = cashQuery.data;
      if (!session) throw new Error("Nenhuma sessão aberta");
      const counts: CashCountInput[] = PAYMENT_METHODS.map((m) => ({
        payment_method: m.value,
        counted_amount: Number(cashCounts[m.value]?.replace(",", ".") || 0),
      }));
      return cashService.closeSession(companyId!, session.id, counts, closeNotes.trim() || undefined);
    },
    onSuccess: async (res) => {
      const v = Number(res.total_variance ?? 0);
      if (Math.abs(v) > 0.009) {
        toast.warning(`Caixa fechado · diferença total ${formatTabMoney(v)}`);
      } else {
        toast.success("Caixa fechado — batimento OK");
      }
      setCloseCashOpen(false);
      setCashCounts({});
      setCloseNotes("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "cash-register", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const dateYmd = useMemo(() => toYmd(day), [day]);
  const subtitle = useMemo(
    () =>
      day.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }),
    [day],
  );

  const tabsQuery = useQuery({
    queryKey: ["admin", "tabs", companyId, dateYmd],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await tabService.listForDate(companyId!, dateYmd);
      if (res.error) throw new Error(formatTabError(res.error));
      return res.data ?? [];
    },
    staleTime: 10_000,
  });

  const openTabs = (tabsQuery.data ?? []).filter((t) => t.status === "open");
  const closedTabs = (tabsQuery.data ?? []).filter((t) => t.status !== "open");

  const closeVariances = useMemo(() => {
    const session = cashQuery.data;
    if (!session) return [];
    return PAYMENT_METHODS.map((m) => {
      const expected = cashExpectedForMethod(session, m.value);
      const counted = Number(cashCounts[m.value]?.replace(",", ".") || 0);
      const hasInput = cashCounts[m.value]?.trim() !== "";
      const variance = hasInput ? counted - expected : null;
      return { ...m, expected, counted: hasInput ? counted : null, variance };
    }).filter((row) => row.expected > 0 || row.counted !== null);
  }, [cashQuery.data, cashCounts]);

  const totalCloseVariance = useMemo(
    () => closeVariances.reduce((s, r) => s + (r.variance ?? 0), 0),
    [closeVariances],
  );

  if (!isOwnerAdmin) {
    return (
      <div>
        <PageTitle title="Comandas" subtitle="Fechamento de atendimentos no caixa" />
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Somente administradores podem fechar comandas. Prestadores veem a comanda ao clicar no agendamento na agenda.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle title="Comandas / Caixa" subtitle={subtitle} />

      <div
        className={`mb-6 rounded-2xl border p-5 shadow-soft ${
          cashOpen ? "border-border bg-card" : "border-amber-500/40 bg-amber-500/5"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Sessão de caixa</h2>
            {cashQuery.data ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Aberto desde {new Date(cashQuery.data.opened_at).toLocaleString("pt-BR")} ·{" "}
                  {cashQuery.data.closed_tabs} comanda(s) · fundo{" "}
                  {formatTabMoney(cashQuery.data.opening_float ?? 0)}
                </p>
                <p className="mt-1 text-xs text-success">Caixa aberto — comandas podem ser fechadas.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Caixa fechado — abra o caixa com o fundo de troco antes de fechar comandas.
                </p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            {cashQuery.data ? (
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setCloseCashOpen(true)}>
                <Lock className="size-4" />
                Fechar caixa
              </Button>
            ) : (
              <Button type="button" className="rounded-full" onClick={() => setOpenCashOpen(true)}>
                <Unlock className="size-4" />
                Abrir caixa
              </Button>
            )}
          </div>
        </div>
        {cashQuery.data ? (
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {PAYMENT_METHODS.map((m) => {
              const expected = cashExpectedForMethod(cashQuery.data!, m.value);
              if (expected <= 0 && m.value !== "dinheiro") return null;
              if (expected <= 0) return null;
              return (
                <span key={m.value} className="rounded-full bg-secondary px-3 py-1">
                  {m.label}: {formatTabMoney(expected)}
                  {m.value === "dinheiro" && Number(cashQuery.data?.opening_float ?? 0) > 0 ? (
                    <span className="text-xs text-muted-foreground"> (incl. fundo)</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      {!cashOpen && openTabs.length > 0 ? (
        <div className="mb-6 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <span>{openTabs.length} comanda(s) aguardando — abra o caixa para liberar o fechamento.</span>
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="w-fit rounded-2xl border border-border bg-card p-2 shadow-soft">
          <CalendarPicker
            mode="single"
            selected={day}
            onSelect={(d) => d && setDay(d)}
            locale={ptBR}
            className="rounded-xl"
          />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Abertas</div>
              <div className="font-display text-2xl text-info">{openTabs.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Fechadas hoje</div>
              <div className="font-display text-2xl text-success">{closedTabs.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total fechado</div>
              <div className="font-display text-2xl">
                {formatTabMoney(closedTabs.reduce((s, t) => s + Number(t.total ?? 0), 0))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {tabsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando comandas…</p>
      ) : (tabsQuery.data ?? []).length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma comanda para este dia.
        </p>
      ) : (
        <div className="space-y-6">
          {openTabs.length > 0 ? (
            <section>
              <h2 className="mb-3 font-display text-lg">Aguardando caixa</h2>
              <ul className="space-y-3">
                {openTabs.map((tab) => (
                  <TabRow
                    key={tab.id}
                    tab={tab}
                    cashOpen={cashOpen}
                    onOpen={() => setDrawerApptId(tab.appointment_id)}
                    onClose={() => setDrawerApptId(tab.appointment_id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {closedTabs.length > 0 ? (
            <section>
              <h2 className="mb-3 font-display text-lg text-muted-foreground">Fechadas</h2>
              <ul className="space-y-3 opacity-90">
                {closedTabs.map((tab) => (
                  <TabRow key={tab.id} tab={tab} cashOpen={cashOpen} onOpen={() => setDrawerApptId(tab.appointment_id)} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <ComandaDrawer
        appointmentId={drawerApptId}
        open={Boolean(drawerApptId)}
        onOpenChange={(o) => !o && setDrawerApptId(null)}
        onClosed={() => {
          tabsQuery.refetch();
          cashQuery.refetch();
        }}
        cashOpen={cashOpen}
      />

      <Dialog open={openCashOpen} onOpenChange={setOpenCashOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir caixa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              Informe o fundo de troco em dinheiro na gaveta (ex.: R$ 100). Use 0 se não houver troco inicial.
            </p>
            <label className="grid gap-1 text-sm">
              <span className="text-xs text-muted-foreground">Fundo de caixa (R$)</span>
              <Input
                placeholder="0,00"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                autoFocus
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenCashOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={openCashMutation.isPending} onClick={() => openCashMutation.mutate()}>
              {openCashMutation.isPending ? "Abrindo…" : "Confirmar abertura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeCashOpen} onOpenChange={setCloseCashOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Batimento de caixa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confira cada forma de pagamento. Em dinheiro, o esperado inclui o fundo de{" "}
            {formatTabMoney(cashQuery.data?.opening_float ?? 0)}.
          </p>
          <div className="max-h-[50vh] overflow-y-auto py-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-2">Forma</th>
                  <th className="pb-2 pr-2 text-right">Esperado</th>
                  <th className="pb-2 pr-2 text-right">Contado</th>
                  <th className="pb-2 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {PAYMENT_METHODS.map((m) => {
                  const expected = cashQuery.data ? cashExpectedForMethod(cashQuery.data, m.value) : 0;
                  const countedStr = cashCounts[m.value] ?? "";
                  const counted = countedStr.trim() ? Number(countedStr.replace(",", ".")) : null;
                  const variance = counted !== null ? counted - expected : null;
                  return (
                    <tr key={m.value} className="border-b border-border/50">
                      <td className="py-2 pr-2 font-medium">{m.label}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatTabMoney(expected)}</td>
                      <td className="py-2 pr-2">
                        <Input
                          className="h-8 text-right"
                          placeholder="0,00"
                          value={countedStr}
                          onChange={(e) => setCashCounts((s) => ({ ...s, [m.value]: e.target.value }))}
                        />
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums font-medium ${
                          variance !== null && Math.abs(variance) > 0.009
                            ? variance > 0
                              ? "text-success"
                              : "text-destructive"
                            : "text-muted-foreground"
                        }`}
                      >
                        {variance !== null ? formatTabMoney(variance) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {Math.abs(totalCloseVariance) > 0.009 ? (
            <p className="text-sm">
              Diferença total:{" "}
              <span className={totalCloseVariance >= 0 ? "text-success" : "text-destructive"}>
                {formatTabMoney(totalCloseVariance)}
              </span>
              {totalCloseVariance > 0 ? " (sobra)" : " (quebra)"}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm">
            <span className="text-xs text-muted-foreground">Observação (opcional)</span>
            <Input
              placeholder="Ex.: quebra de R$ 2,00 — troco errado"
              value={closeNotes}
              onChange={(e) => setCloseNotes(e.target.value)}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseCashOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={closeCashMutation.isPending} onClick={() => closeCashMutation.mutate()}>
              {closeCashMutation.isPending ? "Fechando…" : "Confirmar fechamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabRow({
  tab,
  cashOpen,
  onOpen,
  onClose,
}: {
  tab: ClientTabListRow;
  cashOpen: boolean;
  onOpen: () => void;
  onClose?: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{tab.appointment_time}</span>
          <span className="font-medium">{tab.client_name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ${tabStatusClass[tab.status] ?? "bg-secondary"}`}
          >
            {tabStatusLabel[tab.status] ?? tab.status}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {tab.service_name}
          {tab.provider_name ? ` · ${tab.provider_name}` : ""}
          {tab.client_package_id ? " · Pacote" : ""}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-display text-lg">{formatTabMoney(tab.total)}</span>
        {tab.status === "open" && onClose ? (
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={!cashOpen}
            title={cashOpen ? "Fechar comanda" : "Abra o caixa primeiro"}
            onClick={onClose}
          >
            <Wallet className="size-3.5" />
            Fechar
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={onOpen}>
            <Receipt className="size-3.5" />
            Ver
          </Button>
        )}
      </div>
    </li>
  );
}
