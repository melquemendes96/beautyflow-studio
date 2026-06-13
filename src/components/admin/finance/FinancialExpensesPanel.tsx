import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  adminMobileDialogBodyClass,
  adminMobileDialogContentClass,
  adminMobileDialogFooterClass,
  adminMobileDialogHeaderClass,
} from "@/components/ui/dialog";
import {
  ENTRY_TYPE_LABELS,
  financeService,
  formatFinanceMoney,
  type FinancialEntry,
  type FinancialEntryType,
} from "@/services/financeService";

const CATEGORY_SUGGESTIONS: Record<FinancialEntryType, string[]> = {
  fixed: ["Aluguel", "Energia elétrica", "Água", "Internet", "Condomínio", "Contador", "Software"],
  variable: ["Marketing", "Material de limpeza", "Taxa de cartão", "Manutenção", "Embalagens"],
  prolabore: ["Pró-labore sócia", "Pró-labore sócio"],
  tax: ["Simples Nacional", "ISS", "DAS MEI"],
  other: ["Outros"],
};

type Props = {
  companyId: string;
  entries: FinancialEntry[];
  isLoading?: boolean;
};

const emptyForm = {
  entry_type: "fixed" as FinancialEntryType,
  category: "",
  description: "",
  amount: "",
  entry_date: new Date().toISOString().slice(0, 10),
  recurrence: "none" as "none" | "monthly" | "yearly",
  notes: "",
};

export function FinancialExpensesPanel({ companyId, entries, isLoading }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialEntry | null>(null);
  const [form, setForm] = useState(emptyForm);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "finance"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount.replace(",", "."));
      if (!form.category.trim() && !form.description.trim()) {
        throw new Error("Informe categoria ou descrição.");
      }
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Valor inválido.");
      const res = await financeService.upsertEntry(companyId, {
        id: editing?.id,
        entry_type: form.entry_type,
        category: form.category.trim(),
        description: form.description.trim() || form.category.trim(),
        amount,
        entry_date: form.entry_date,
        recurrence: form.recurrence,
        notes: form.notes.trim() || null,
      });
      if (!res.ok) throw new Error(res.message ?? res.error);
      return res;
    },
    onSuccess: async () => {
      toast.success(editing ? "Lançamento atualizado." : "Lançamento cadastrado.");
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await financeService.deleteEntry(companyId, id);
      if (!res.ok) throw new Error(res.message ?? res.error);
    },
    onSuccess: async () => {
      toast.success("Lançamento removido.");
      await invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const beginEdit = (entry: FinancialEntry) => {
    setEditing(entry);
    setForm({
      entry_type: entry.entry_type,
      category: entry.category,
      description: entry.description,
      amount: String(entry.amount),
      entry_date: entry.entry_date,
      recurrence: entry.recurrence,
      notes: entry.notes ?? "",
    });
    setOpen(true);
  };

  const beginCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, entry_date: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  };

  const suggestions = CATEGORY_SUGGESTIONS[form.entry_type] ?? [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-elegant">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="font-display text-lg">Despesas e pró-labore</h3>
          <p className="text-xs text-muted-foreground">
            Custos fixos, variáveis, impostos e retiradas dos sócios
          </p>
        </div>
        <Button type="button" size="sm" className="rounded-full" onClick={beginCreate}>
          <Plus className="mr-1.5 size-4" />
          Novo lançamento
        </Button>
      </div>

      {isLoading ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">Carregando lançamentos…</p>
      ) : entries.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Cadastre aluguel, contas, pró-labore e outras despesas para completar a DRE.
          </p>
          <Button type="button" variant="outline" className="mt-4 rounded-full" onClick={beginCreate}>
            Cadastrar primeira despesa
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-secondary/20"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {ENTRY_TYPE_LABELS[entry.entry_type]}
                  </span>
                  {entry.recurrence !== "none" && (
                    <span className="text-[10px] text-primary">Recorrente</span>
                  )}
                </div>
                <p className="mt-1 truncate font-medium">
                  {entry.description || entry.category}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.entry_date + "T12:00:00").toLocaleDateString("pt-BR")}
                  {entry.category && entry.description !== entry.category ? ` · ${entry.category}` : ""}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                −{formatFinanceMoney(entry.amount)}
              </span>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => beginEdit(entry)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-destructive"
                  onClick={() => deleteMutation.mutate(entry.id)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={adminMobileDialogContentClass}>
          <DialogHeader className={adminMobileDialogHeaderClass}>
            <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          </DialogHeader>
          <div className={`space-y-4 ${adminMobileDialogBodyClass}`}>
            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Tipo</span>
              <Select
                value={form.entry_type}
                onValueChange={(v) => setForm((s) => ({ ...s, entry_type: v as FinancialEntryType, category: "" }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ENTRY_TYPE_LABELS) as FinancialEntryType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ENTRY_TYPE_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Categoria</span>
              <Input
                list="finance-category-suggestions"
                value={form.category}
                onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                placeholder="Ex.: Aluguel"
              />
              <datalist id="finance-category-suggestions">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>

            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Descrição (opcional)</span>
              <Input
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                placeholder="Detalhe do lançamento"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Valor (R$)</span>
                <Input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                  placeholder="0,00"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Data (competência)</span>
                <Input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm((s) => ({ ...s, entry_date: e.target.value }))}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Recorrência</span>
              <Select
                value={form.recurrence}
                onValueChange={(v) => setForm((s) => ({ ...s, recurrence: v as typeof form.recurrence }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Única</SelectItem>
                  <SelectItem value="monthly">Mensal (referência)</SelectItem>
                  <SelectItem value="yearly">Anual (referência)</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter className={adminMobileDialogFooterClass}>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
