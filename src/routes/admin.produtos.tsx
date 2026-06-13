import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { AdminEmptyState } from "@/components/admin/AdminPageStates";
import { useCurrentCompany } from "@/lib/current-company";
import { productService, type ProductRow } from "@/services/productService";
import { formatTabMoney } from "@/services/tabService";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Pencil, Plus, AlertTriangle } from "lucide-react";
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

export const Route = createFileRoute("/admin/produtos")({
  component: Produtos,
});

function Produtos() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany, isOwnerAdmin } = useCurrentCompany();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [stockOpen, setStockOpen] = useState<ProductRow | null>(null);
  const [stockDelta, setStockDelta] = useState("");
  const [stockNotes, setStockNotes] = useState("");
  const [form, setForm] = useState({
    name: "",
    sku: "",
    sale_price: "",
    cost_price: "",
    min_stock_quantity: "0",
    commission_pct: "",
    is_consumable: false,
    track_stock: true,
    active: true,
  });

  const productsQuery = useQuery({
    queryKey: ["admin", "products", companyId],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: () => productService.list(companyId!),
  });

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const resetForm = () => {
    setForm({
      name: "",
      sku: "",
      sale_price: "",
      cost_price: "",
      min_stock_quantity: "0",
      commission_pct: "",
      is_consumable: false,
      track_stock: true,
      active: true,
    });
    setEditing(null);
  };

  const beginEdit = (p: ProductRow) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku ?? "",
      sale_price: String(p.sale_price ?? 0),
      cost_price: String(p.cost_price ?? 0),
      min_stock_quantity: String(p.min_stock_quantity ?? 0),
      commission_pct: p.commission_pct != null ? String(p.commission_pct) : "",
      is_consumable: p.is_consumable,
      track_stock: p.track_stock,
      active: p.active,
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      if (!form.name.trim()) throw new Error("Nome obrigatório");
      const salePrice = Number(form.sale_price);
      if (!Number.isFinite(salePrice) || salePrice < 0) throw new Error("Preço inválido");
      return productService.upsert(companyId, {
        id: editing?.id,
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        sale_price: salePrice,
        cost_price: Number(form.cost_price) || 0,
        min_stock_quantity: Number(form.min_stock_quantity) || 0,
        commission_pct: form.commission_pct.trim() ? Number(form.commission_pct) : null,
        is_consumable: form.is_consumable,
        track_stock: form.track_stock,
        active: form.active,
      });
    },
    onSuccess: async () => {
      toast.success("Produto salvo");
      setOpen(false);
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ["admin", "products", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stockMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !stockOpen) throw new Error("Sem produto");
      const delta = Number(stockDelta.replace(",", "."));
      if (!Number.isFinite(delta) || delta === 0) throw new Error("Informe a quantidade (+ ou -)");
      return productService.adjustStock(companyId, stockOpen.id, delta, stockNotes.trim() || undefined);
    },
    onSuccess: async () => {
      toast.success("Estoque atualizado");
      setStockOpen(null);
      setStockDelta("");
      setStockNotes("");
      await queryClient.invalidateQueries({ queryKey: ["admin", "products", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!isOwnerAdmin) {
    return (
      <div>
        <PageTitle title="Produtos" subtitle="Catálogo e estoque" />
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Somente administradores podem gerenciar produtos.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="Produtos"
        subtitle="Venda na comanda, estoque e insumos por serviço"
        action={
          <Button
            type="button"
            className="rounded-full"
            onClick={() => {
              resetForm();
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            Novo produto
          </Button>
        }
      />

      {productsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando produtos…</p>
      ) : products.length === 0 ? (
        <AdminEmptyState
          icon={Package}
          title="Nenhum produto cadastrado"
          description="Cadastre produtos para vender na comanda e controlar estoque."
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <li key={p.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg">{p.name}</h3>
                  {p.sku ? <p className="text-xs text-muted-foreground">SKU: {p.sku}</p> : null}
                </div>
                {p.low_stock ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">
                    <AlertTriangle className="size-3" />
                    Baixo
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {p.is_consumable ? (
                  <span className="rounded-full bg-secondary px-2 py-0.5">Insumo</span>
                ) : null}
                {!p.track_stock ? (
                  <span className="rounded-full bg-secondary px-2 py-0.5">Sem controle de estoque</span>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Venda</div>
                  <div className="font-medium">{formatTabMoney(p.sale_price)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Estoque</div>
                  <div className="font-medium">
                    {p.track_stock ? Number(p.stock_quantity).toLocaleString("pt-BR") : "—"}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button type="button" variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => beginEdit(p)}>
                  <Pencil className="size-3.5" />
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-full"
                  onClick={() => {
                    setStockOpen(p);
                    setStockDelta("");
                    setStockNotes("");
                  }}
                >
                  Estoque
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={(v) => !v && (setOpen(false), resetForm())}>
        <DialogContent className={adminMobileDialogContentClass}>
          <DialogHeader className={adminMobileDialogHeaderClass}>
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
          </DialogHeader>
          <div className={`grid gap-3 ${adminMobileDialogBodyClass}`}>
            <Input placeholder="Nome *" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
            <Input placeholder="SKU (opcional)" value={form.sku} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Preço venda" value={form.sale_price} onChange={(e) => setForm((s) => ({ ...s, sale_price: e.target.value }))} />
              <Input placeholder="Custo" value={form.cost_price} onChange={(e) => setForm((s) => ({ ...s, cost_price: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Estoque mínimo" value={form.min_stock_quantity} onChange={(e) => setForm((s) => ({ ...s, min_stock_quantity: e.target.value }))} />
              <Input placeholder="Comissão %" value={form.commission_pct} onChange={(e) => setForm((s) => ({ ...s, commission_pct: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_consumable} onChange={(e) => setForm((s) => ({ ...s, is_consumable: e.target.checked }))} />
              Insumo (consumível em serviços)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.track_stock} onChange={(e) => setForm((s) => ({ ...s, track_stock: e.target.checked }))} />
              Controlar estoque
            </label>
          </div>
          <DialogFooter className={adminMobileDialogFooterClass}>
            <Button variant="outline" onClick={() => (setOpen(false), resetForm())}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(stockOpen)} onOpenChange={(v) => !v && setStockOpen(null)}>
        <DialogContent className={adminMobileDialogContentClass}>
          <DialogHeader className={adminMobileDialogHeaderClass}>
            <DialogTitle>Ajustar estoque — {stockOpen?.name}</DialogTitle>
          </DialogHeader>
          <div className={`grid gap-3 ${adminMobileDialogBodyClass}`}>
            <p className="text-sm text-muted-foreground">
              Atual: {stockOpen ? Number(stockOpen.stock_quantity).toLocaleString("pt-BR") : "—"}
            </p>
            <Input
              placeholder="Quantidade (+ entrada, - saída)"
              value={stockDelta}
              onChange={(e) => setStockDelta(e.target.value)}
            />
            <Input placeholder="Observação (opcional)" value={stockNotes} onChange={(e) => setStockNotes(e.target.value)} />
          </div>
          <DialogFooter className={adminMobileDialogFooterClass}>
            <Button variant="outline" onClick={() => setStockOpen(null)}>
              Cancelar
            </Button>
            <Button onClick={() => stockMutation.mutate()} disabled={stockMutation.isPending}>
              {stockMutation.isPending ? "Salvando…" : "Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
