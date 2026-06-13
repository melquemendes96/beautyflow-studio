import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentCompany } from "@/lib/current-company";
import { productService, type ServiceConsumableRow } from "@/services/productService";
import { toast } from "sonner";
import { useState } from "react";

type Props = {
  serviceId: string;
  enabled: boolean;
};

export function ServiceConsumablesEditor({ serviceId, enabled }: Props) {
  const queryClient = useQueryClient();
  const { companyId } = useCurrentCompany();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const productsQuery = useQuery({
    queryKey: ["admin", "products", "consumables", companyId],
    enabled: enabled && Boolean(companyId),
    queryFn: () => productService.list(companyId!),
  });

  const consumablesQuery = useQuery({
    queryKey: ["admin", "service-consumables", companyId, serviceId],
    enabled: enabled && Boolean(companyId) && Boolean(serviceId),
    queryFn: () => productService.listServiceConsumables(companyId!, serviceId),
  });

  const consumableProducts = (productsQuery.data ?? []).filter((p) => p.is_consumable);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !productId) throw new Error("Selecione um insumo");
      const qty = Number(quantity.replace(",", "."));
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida");
      return productService.upsertServiceConsumable(companyId, serviceId, productId, qty);
    },
    onSuccess: async () => {
      toast.success("Insumo vinculado");
      setProductId("");
      setQuantity("1");
      await queryClient.invalidateQueries({ queryKey: ["admin", "service-consumables", companyId, serviceId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Sem empresa");
      return productService.deleteServiceConsumable(companyId, id);
    },
    onSuccess: async () => {
      toast.success("Insumo removido");
      await queryClient.invalidateQueries({ queryKey: ["admin", "service-consumables", companyId, serviceId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!enabled) return null;

  const items = consumablesQuery.data ?? [];

  return (
    <div className="mt-4 rounded-xl border border-border bg-secondary/30 p-4">
      <h4 className="text-sm font-medium">Insumos por atendimento (Fase 5)</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Baixa automática de estoque ao fechar a comanda deste serviço.
      </p>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item: ServiceConsumableRow) => (
            <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm">
              <span>
                {item.product_name} · {Number(item.quantity_per_service).toLocaleString("pt-BR")} un.
                <span className="ml-2 text-xs text-muted-foreground">
                  (estoque {Number(item.stock_quantity).toLocaleString("pt-BR")})
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Nenhum insumo configurado.</p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Select value={productId || undefined} onValueChange={setProductId}>
          <SelectTrigger>
            <SelectValue placeholder="Produto insumo" />
          </SelectTrigger>
          <SelectContent>
            {consumableProducts.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="sm:w-24"
          placeholder="Qtd"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Button type="button" variant="outline" className="rounded-full" disabled={addMutation.isPending} onClick={() => addMutation.mutate()}>
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
