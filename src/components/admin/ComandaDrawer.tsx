import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentCompany } from "@/lib/current-company";
import {
  formatTabError,
  formatTabMoney,
  PAYMENT_METHODS,
  tabService,
  type ClientTabDetail,
  type ClientTabLine,
  type PackageResolution,
  type PaymentMethod,
} from "@/services/tabService";
import { serviceService } from "@/services/serviceService";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { ComandaPackagePaymentStep } from "@/components/admin/ComandaPackagePaymentStep";
import { productService } from "@/services/productService";
import { Trash2, Plus } from "lucide-react";

type Props = {
  appointmentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed?: () => void;
  cashOpen?: boolean;
};

function tabStatusLabel(status: string) {
  if (status === "open") return "Aberta";
  if (status === "closed") return "Fechada";
  if (status === "cancelled") return "Cancelada";
  return status;
}

export function ComandaDrawer({ appointmentId, open, onOpenChange, onClosed, cashOpen = true }: Props) {
  const queryClient = useQueryClient();
  const { companyId, isOwnerAdmin } = useCurrentCompany();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [packageResolution, setPackageResolution] = useState<PackageResolution | null>(null);
  const [avulsoServiceId, setAvulsoServiceId] = useState("");
  const [addProductId, setAddProductId] = useState("");
  const [addProductQty, setAddProductQty] = useState("1");

  const tabQuery = useQuery({
    queryKey: ["admin", "tab", appointmentId],
    enabled: open && Boolean(appointmentId),
    queryFn: async () => {
      const res = await tabService.getForAppointment(appointmentId!);
      if (res.error) throw new Error(formatTabError(res.error, "Não foi possível carregar a comanda."));
      if (!res.data) throw new Error("Comanda não encontrada.");
      return res.data;
    },
  });

  const singleServicesQuery = useQuery({
    queryKey: ["admin", "services", "single", companyId],
    enabled: open && Boolean(companyId),
    queryFn: async () => {
      const res = await serviceService.listActiveByCompany(companyId!);
      if (res.error) throw res.error;
      return (res.data ?? []).filter(
        (s: { service_kind?: string | null }) => (s.service_kind ?? "single") !== "package",
      );
    },
    staleTime: 60_000,
  });

  const productsQuery = useQuery({
    queryKey: ["admin", "products", "comanda", companyId],
    enabled: open && Boolean(companyId) && Boolean(tabQuery.data?.inventory_enabled),
    queryFn: () => productService.list(companyId!),
    staleTime: 60_000,
  });

  const addProductMutation = useMutation({
    mutationFn: async (tabId: string) => {
      if (!companyId || !addProductId) throw new Error("Selecione um produto");
      const qty = Number(addProductQty.replace(",", "."));
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Quantidade inválida");
      const res = await tabService.addProductLine(companyId, tabId, addProductId, qty);
      if (res.error) throw new Error(formatTabError(res.error));
      const payload = res.data as { ok?: boolean; error?: string };
      if (!payload?.ok) throw new Error(formatTabError(payload?.error));
      return payload;
    },
    onSuccess: async () => {
      setAddProductId("");
      setAddProductQty("1");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tab", appointmentId] });
      toast.success("Produto adicionado");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await tabService.removeLine(companyId, lineId);
      if (res.error) throw new Error(formatTabError(res.error));
      const payload = res.data as { ok?: boolean; error?: string };
      if (!payload?.ok) throw new Error(formatTabError(payload?.error));
      return payload;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "tab", appointmentId] });
      toast.success("Item removido");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  useEffect(() => {
    if (!open) {
      setPaymentMethod("pix");
      setPackageResolution(null);
      setAvulsoServiceId("");
      setAddProductId("");
      setAddProductQty("1");
    }
  }, [open]);

  const handlePackageResolutionChange = (value: PackageResolution) => {
    setPackageResolution(value);
    if (value === "avulso") {
      setAvulsoServiceId("");
    }
  };

  const closeMutation = useMutation({
    mutationFn: async (input: {
      tabId: string;
      packageResolution?: PackageResolution | null;
      singleServiceId?: string | null;
    }) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await tabService.closeTab(
        companyId,
        input.tabId,
        paymentMethod,
        input.packageResolution,
        input.singleServiceId,
      );
      if (res.error) throw new Error(formatTabError(res.error));
      const payload = res.data as { ok?: boolean; error?: string; message?: string };
      if (!payload?.ok) {
        throw new Error(formatTabError(payload?.error ?? "Não foi possível fechar a comanda."));
      }
      return payload;
    },
    onSuccess: async (payload) => {
      toast.success(payload.message ?? "Comanda fechada — atendimento concluído.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "tab", appointmentId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "tabs"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda"] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "packages"] });
      onOpenChange(false);
      onClosed?.();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const data = tabQuery.data;
  const tab = data?.tab;
  const pendingPackage = Boolean(data?.package_pending_payment);

  const selectedAvulsoService = useMemo(
    () =>
      (singleServicesQuery.data ?? []).find(
        (s: { id: string }) => s.id === avulsoServiceId,
      ) as { id: string; name: string; price: number } | undefined,
    [singleServicesQuery.data, avulsoServiceId],
  );

  const previewLines = useMemo((): ClientTabLine[] => {
    const lines = data?.lines ?? [];
    if (!pendingPackage || packageResolution !== "avulso" || !selectedAvulsoService) {
      return lines;
    }
    const price = Number(selectedAvulsoService.price ?? 0);
    if (lines.length === 0) {
      return [
        {
          id: "preview",
          line_type: "service",
          service_id: selectedAvulsoService.id,
          description: selectedAvulsoService.name,
          quantity: 1,
          unit_price: price,
          line_total: price,
        },
      ];
    }
    return lines.map((line, index) =>
      index === 0
        ? {
            ...line,
            service_id: selectedAvulsoService.id,
            description: selectedAvulsoService.name,
            unit_price: price,
            line_total: price,
          }
        : line,
    );
  }, [data?.lines, pendingPackage, packageResolution, selectedAvulsoService]);

  const displayTotal = useMemo(() => {
    if (pendingPackage && packageResolution === "avulso") {
      if (selectedAvulsoService) return Number(selectedAvulsoService.price ?? 0);
      return 0;
    }
    return Number(tab?.total ?? 0);
  }, [pendingPackage, packageResolution, selectedAvulsoService, tab?.total]);

  const canClose =
    isOwnerAdmin &&
    cashOpen &&
    tab?.status === "open" &&
    data?.appointment?.status !== "cancelled" &&
    data?.appointment?.status !== "no_show";

  const canSubmitClose =
    canClose &&
    (!pendingPackage ||
      packageResolution === "confirm" ||
      (packageResolution === "avulso" && Boolean(avulsoServiceId)));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display">
            <Receipt className="size-5 text-gold" />
            Comanda
          </SheetTitle>
          <SheetDescription>
            {data?.client?.name ?? "Cliente"}
            {data?.client?.whatsapp ? ` · ${data.client.whatsapp}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {tabQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando comanda…</p>
          ) : tabQuery.isError ? (
            <p className="text-sm text-destructive">
              {tabQuery.error instanceof Error
                ? tabQuery.error.message
                : "Não foi possível carregar a comanda."}
            </p>
          ) : tab && data ? (
            <ComandaBody
              data={data}
              packageResolution={packageResolution}
              previewLines={previewLines}
              displayTotal={displayTotal}
              canEditProducts={Boolean(isOwnerAdmin && tab.status === "open" && data.inventory_enabled)}
              onRemoveLine={(lineId) => removeLineMutation.mutate(lineId)}
              removingLineId={removeLineMutation.isPending ? removeLineMutation.variables : null}
            />
          ) : null}
        </div>

        {canClose ? (
          <SheetFooter className="flex-col gap-3 border-t pt-4 sm:flex-col">
            {pendingPackage ? (
              <>
                <ComandaPackagePaymentStep
                  value={packageResolution}
                  onChange={handlePackageResolutionChange}
                  disabled={closeMutation.isPending}
                />
                {packageResolution === "avulso" ? (
                  <label className="grid w-full gap-1.5 text-left">
                    <span className="text-xs font-medium text-muted-foreground">
                      Serviço avulso realizado
                    </span>
                    <Select value={avulsoServiceId || undefined} onValueChange={setAvulsoServiceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o serviço avulso" />
                      </SelectTrigger>
                      <SelectContent>
                        {(singleServicesQuery.data ?? []).map(
                          (s: { id: string; name: string; price: number }) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} · {formatTabMoney(Number(s.price ?? 0))}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                    {!avulsoServiceId ? (
                      <span className="text-[11px] text-muted-foreground">
                        O valor da comanda será o preço deste serviço avulso.
                      </span>
                    ) : null}
                  </label>
                ) : null}
              </>
            ) : null}
            {data?.inventory_enabled && tab?.status === "open" && isOwnerAdmin ? (
              <div className="grid w-full gap-2 rounded-xl border border-border bg-secondary/30 p-3">
                <span className="text-xs font-medium text-muted-foreground">Adicionar produto</span>
                <Select value={addProductId || undefined} onValueChange={setAddProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Produto para venda" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsQuery.data ?? [])
                      .filter((p) => !p.is_consumable)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {formatTabMoney(p.sale_price)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <input
                    className="h-10 w-20 rounded-md border border-input bg-background px-3 text-sm"
                    value={addProductQty}
                    onChange={(e) => setAddProductQty(e.target.value)}
                    aria-label="Quantidade"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-full"
                    disabled={addProductMutation.isPending || !addProductId || !tab?.id}
                    onClick={() => tab && addProductMutation.mutate(tab.id)}
                  >
                    <Plus className="size-4" />
                    Adicionar
                  </Button>
                </div>
              </div>
            ) : null}
            <label className="grid w-full gap-1.5 text-left">
              <span className="text-xs font-medium text-muted-foreground">Forma de pagamento</span>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button
              type="button"
              className="w-full rounded-full"
              disabled={closeMutation.isPending || !canSubmitClose}
              onClick={() =>
                tab &&
                closeMutation.mutate({
                  tabId: tab.id,
                  packageResolution: pendingPackage ? packageResolution : null,
                  singleServiceId:
                    pendingPackage && packageResolution === "avulso" ? avulsoServiceId : null,
                })
              }
            >
              <Wallet className="size-4" />
              {closeMutation.isPending ? "Fechando…" : `Fechar comanda · ${formatTabMoney(displayTotal)}`}
            </Button>
          </SheetFooter>
        ) : tab?.status === "open" && isOwnerAdmin && !cashOpen ? (
          <SheetFooter className="border-t pt-4">
            <p className="w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-900 dark:text-amber-100">
              Abra o caixa em Comandas / Caixa antes de fechar esta comanda.
            </p>
          </SheetFooter>
        ) : tab?.status === "open" && !isOwnerAdmin ? (
          <SheetFooter className="border-t pt-4">
            <p className="w-full text-center text-xs text-muted-foreground">
              Aguardando fechamento no caixa/admin.
            </p>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ComandaBody({
  data,
  packageResolution,
  previewLines,
  displayTotal,
  canEditProducts,
  saleProducts,
  onRemoveLine,
  removingLineId,
}: {
  data: ClientTabDetail;
  packageResolution: PackageResolution | null;
  previewLines: ClientTabLine[];
  displayTotal: number;
  canEditProducts?: boolean;
  onRemoveLine?: (lineId: string) => void;
  removingLineId?: string | null;
}) {
  const { tab, appointment, package_remaining } = data;
  const lines = previewLines;
  const isAvulsoPreview = Boolean(data.package_pending_payment && packageResolution === "avulso");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            tab.status === "open"
              ? "bg-info/15 text-info"
              : tab.status === "closed"
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {tabStatusLabel(tab.status)}
        </span>
        <span className="text-muted-foreground">
          {appointment.appointment_time} · {appointment.status}
        </span>
      </div>

      {data.package_pending_payment && tab.status === "open" ? (
        <p
          className={`rounded-xl border px-3 py-2 text-xs ${
            packageResolution === "avulso"
              ? "border-border bg-secondary/40 text-muted-foreground"
              : "border-gold/30 bg-gold-soft/20"
          }`}
        >
          {packageResolution === "avulso"
            ? "Atendimento avulso — pacote não será ativado. Selecione o serviço e o valor correspondente abaixo."
            : packageResolution === "confirm"
              ? "Pacote completo — cobrança do valor total do pacote. Comissão do prestador sobre este valor."
              : "1ª sessão com pacote pendente — escolha confirmar pacote ou atendimento avulso."}
        </p>
      ) : appointment.client_package_id ? (
        <p className="rounded-xl border border-gold/30 bg-gold-soft/20 px-3 py-2 text-xs">
          {package_remaining != null && tab.status === "open"
            ? `Pacote — após fechar, restarão ${package_remaining} sessão(ões) (contando esta).`
            : package_remaining != null
              ? `Pacote — restam ${package_remaining} sessão(ões).`
              : "Atendimento vinculado a pacote."}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-xl border border-border">
        {lines.map((line) => (
          <li key={line.id} className="flex items-start justify-between gap-3 px-3 py-3 text-sm">
            <div className="min-w-0">
              <div className="font-medium">{line.description}</div>
              {line.line_type === "product" ? (
                <div className="text-xs text-muted-foreground">Produto · {Number(line.quantity)} × {formatTabMoney(line.unit_price)}</div>
              ) : line.line_type === "service" && Number(line.unit_price) === 0 && !isAvulsoPreview ? (
                <div className="text-xs text-muted-foreground">Incluído no pacote</div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {Number(line.quantity)} × {formatTabMoney(line.unit_price)}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <div className="font-medium">{formatTabMoney(line.line_total)}</div>
              {canEditProducts && line.line_type === "product" && line.id !== "preview" && onRemoveLine ? (
                <button
                  type="button"
                  className="rounded-full p-1 text-destructive hover:bg-destructive/10"
                  disabled={removingLineId === line.id}
                  onClick={() => onRemoveLine(line.id)}
                  aria-label="Remover produto"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3 text-sm font-medium">
        <span>Total</span>
        <span className="font-display text-lg">{formatTabMoney(displayTotal)}</span>
      </div>

      {tab.status === "closed" && tab.payment_method ? (
        <p className="text-xs text-muted-foreground">
          Pago via {PAYMENT_METHODS.find((m) => m.value === tab.payment_method)?.label ?? tab.payment_method}
        </p>
      ) : null}
    </div>
  );
}
