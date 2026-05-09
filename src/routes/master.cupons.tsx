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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Ticket } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/master/cupons")({
  component: MasterCupons,
});

function discountLabel(type: string | null | undefined, value: unknown): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "—";
  if (type === "percent") return `${num}%`;
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function MasterCupons() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    code: "",
    discountType: "percent" as "percent" | "fixed",
    discountValue: "",
    active: true,
    expiresAt: "",
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["master", "coupons"],
    queryFn: async () => {
      const res = await masterService.listCoupons();
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const parsedValue = useMemo(() => Number(form.discountValue), [form.discountValue]);

  const createCouponMutation = useMutation({
    mutationFn: async () => {
      const code = form.code.trim();
      if (!code) throw new Error("Código obrigatório");
      if (Number.isNaN(parsedValue)) throw new Error("Valor inválido");
      const res = await masterService.createCoupon({
        code,
        discount_type: form.discountType,
        discount_value: parsedValue,
        active: form.active,
        expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm({ code: "", discountType: "percent", discountValue: "", active: true, expiresAt: "" });
      await queryClient.invalidateQueries({ queryKey: ["master", "coupons"] });
    },
  });

  const updateCouponMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Sem cupom");
      if (Number.isNaN(parsedValue)) throw new Error("Valor inválido");
      const res = await masterService.updateCoupon(editing.id, {
        discount_type: form.discountType,
        discount_value: parsedValue,
        active: form.active,
        expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm({ code: "", discountType: "percent", discountValue: "", active: true, expiresAt: "" });
      await queryClient.invalidateQueries({ queryKey: ["master", "coupons"] });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (input: { couponId: string; active: boolean }) => {
      const res = await masterService.updateCoupon(input.couponId, { active: input.active });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["master", "coupons"] });
    },
  });

  const beginCreate = () => {
    setEditing(null);
    setForm({ code: "", discountType: "percent", discountValue: "", active: true, expiresAt: "" });
    setOpen(true);
  };

  const beginEdit = (c: any) => {
    setEditing(c);
    setForm({
      code: c.code ?? "",
      discountType: (c.discount_type as "percent" | "fixed") ?? "percent",
      discountValue: c.discount_value != null ? String(c.discount_value) : "",
      active: Boolean(c.active),
      expiresAt: c.expires_at ? new Date(c.expires_at).toISOString().slice(0, 10) : "",
    });
    setOpen(true);
  };

  return (
    <div>
      <MasterPageTitle
        title="Cupons"
        subtitle="Gerencie códigos promocionais."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-foreground text-background hover:opacity-90" onClick={beginCreate}>
                Novo cupom
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar cupom" : "Criar cupom"}</DialogTitle>
                <DialogDescription>
                  Cupons são globais na plataforma. O código é único (não diferencia maiúsculas/minúsculas).
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Código</span>
                  <Input
                    value={form.code}
                    onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
                    placeholder="BEAUTY10"
                    disabled={Boolean(editing)}
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Tipo de desconto</span>
                    <Select
                      value={form.discountType}
                      onValueChange={(v) => setForm((s) => ({ ...s, discountType: v as "percent" | "fixed" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percentual (%)</SelectItem>
                        <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Valor</span>
                    <Input
                      value={form.discountValue}
                      onChange={(e) => setForm((s) => ({ ...s, discountValue: e.target.value }))}
                      placeholder={form.discountType === "percent" ? "10" : "20"}
                    />
                  </label>
                </div>

                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Expira em (opcional)</span>
                  <Input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setForm((s) => ({ ...s, expiresAt: e.target.value }))}
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2 text-sm">
                  <span>Cupom ativo</span>
                  <button
                    type="button"
                    onClick={() => setForm((s) => ({ ...s, active: !s.active }))}
                    className={`relative h-6 w-11 rounded-full transition ${form.active ? "bg-foreground" : "bg-muted"}`}
                  >
                    <span
                      className={`absolute top-0.5 size-5 rounded-full bg-background transition ${form.active ? "left-5" : "left-0.5"}`}
                    />
                  </button>
                </label>
              </div>

              {(createCouponMutation.error || updateCouponMutation.error) && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Não foi possível salvar o cupom. Verifique código/valor e tente novamente.
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={createCouponMutation.isPending || updateCouponMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => (editing ? updateCouponMutation.mutate() : createCouponMutation.mutate())}
                  disabled={createCouponMutation.isPending || updateCouponMutation.isPending}
                >
                  {editing
                    ? updateCouponMutation.isPending
                      ? "Salvando…"
                      : "Salvar alterações"
                    : createCouponMutation.isPending
                      ? "Criando…"
                      : "Criar cupom"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">
          {isLoading ? "Carregando…" : `${data?.length ?? 0} cupom(ns)`}
        </div>

        {error && (
          <div className="px-5 py-4 text-sm text-destructive">
            Não foi possível carregar os cupons.
          </div>
        )}

        <div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-5 py-3">Código</th>
                <th className="px-5 py-3">Desconto</th>
                <th className="px-5 py-3">Ativo</th>
                <th className="px-5 py-3">Expira em</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <AdminTableRowSkeleton key={`sk-${i}`} cols={5} />
                ))}
              {!isLoading &&
                (data ?? []).map((c: any) => (
                <tr key={c.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-5 py-4 font-medium text-foreground">{c.code}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {discountLabel(c.discount_type, c.discount_value)}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={c.active ? "default" : "secondary"}>{c.active ? "Sim" : "Não"}</Badge>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => beginEdit(c)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant={c.active ? "secondary" : "default"}
                        onClick={() =>
                          toggleActiveMutation.mutate({ couponId: c.id, active: !Boolean(c.active) })
                        }
                        disabled={toggleActiveMutation.isPending}
                      >
                        {c.active ? "Desativar" : "Ativar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <tr>
                  <td className="p-0" colSpan={5}>
                    <div className="p-4">
                      <AdminEmptyState
                        icon={Ticket}
                        title="Nenhum cupom"
                        description="Crie códigos promocionais com desconto percentual ou valor fixo para campanhas."
                        action={
                          <Button
                            className="rounded-full bg-foreground text-background hover:opacity-90"
                            onClick={beginCreate}
                          >
                            Novo cupom
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
    </div>
  );
}

