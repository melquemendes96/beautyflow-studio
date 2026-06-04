import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { MessageCircle, Calendar, Clock } from "lucide-react";
import { AdminEmptyState, AdminWaitlistCardSkeleton } from "@/components/admin/AdminPageStates";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { waitlistService } from "@/services/waitlistService";
import { clientService } from "@/services/clientService";
import { serviceService } from "@/services/serviceService";
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
import { useState } from "react";
import { appointmentService } from "@/services/appointmentService";

export const Route = createFileRoute("/admin/lista-espera")({
  component: Espera,
});

function Espera() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();
  const [open, setOpen] = useState(false);
  const [convertOpenId, setConvertOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    service_id: "",
    desired_date: "",
    notes: "",
    convert_time: "09:00",
  });

  const waitlistQuery = useQuery({
    queryKey: ["admin", "waitlist", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await waitlistService.listByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const clientsQuery = useQuery({
    queryKey: ["admin", "clients", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await clientService.listByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const servicesQuery = useQuery({
    queryKey: ["admin", "services", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await serviceService.listActiveByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      if (!form.client_id || !form.service_id) throw new Error("Campos obrigatórios");
      const res = await waitlistService.create(companyId, {
        client_id: form.client_id,
        service_id: form.service_id,
        desired_date: form.desired_date.trim() || null,
        notes: form.notes.trim() || null,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      setForm((s) => ({ ...s, client_id: "", service_id: "", desired_date: "", notes: "" }));
      await queryClient.invalidateQueries({ queryKey: ["admin", "waitlist", companyId] });
      toast.success("Adicionado à lista de espera");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await waitlistService.remove(companyId, id);
      if (res.error) throw res.error;
      return true;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "waitlist", companyId] });
      toast.success("Removido da lista de espera");
    },
  });

  const convertMutation = useMutation({
    mutationFn: async (entry: any) => {
      if (!companyId) throw new Error("Sem empresa");
      const desired = String(entry.desired_date ?? "").slice(0, 10);
      if (!desired) throw new Error("Sem data desejada");
      const res = await appointmentService.create(companyId, {
        client_id: entry.client_id,
        service_id: entry.service_id,
        appointment_date: desired,
        appointment_time: form.convert_time,
      });
      if (res.error) throw res.error;
      const del = await waitlistService.remove(companyId, entry.id);
      if (del.error) throw del.error;
      return res.data;
    },
    onSuccess: async () => {
      setConvertOpenId(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "waitlist", companyId] });
      toast.success("Convertido em agendamento");
    },
  });

  return (
    <div>
      <PageTitle
        title="Lista de espera"
        subtitle={
          waitlistQuery.isLoading ? "Carregando…" : `${(waitlistQuery.data ?? []).length} clientes aguardando`
        }
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background">
                Adicionar
              </button>
            </DialogTrigger>
            <DialogContent className={adminMobileDialogContentClass}>
              <DialogHeader className={adminMobileDialogHeaderClass}>
                <DialogTitle>Novo item na lista de espera</DialogTitle>
                <DialogDescription>Cliente aguardando por um horário.</DialogDescription>
              </DialogHeader>

              <div className={adminMobileDialogBodyClass}>
                <div className="grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Cliente</span>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.client_id}
                      onChange={(e) => setForm((s) => ({ ...s, client_id: e.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {(clientsQuery.data ?? []).map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Serviço</span>
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.service_id}
                      onChange={(e) => setForm((s) => ({ ...s, service_id: e.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {(servicesQuery.data ?? []).map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Data desejada (YYYY-MM-DD)</span>
                    <Input
                      value={form.desired_date}
                      onChange={(e) => setForm((s) => ({ ...s, desired_date: e.target.value }))}
                      placeholder="Ex.: 2026-05-10"
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Observações</span>
                    <Input
                      value={form.notes}
                      onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                      placeholder="Opcional"
                    />
                  </label>
                </div>
              </div>

              <DialogFooter className={adminMobileDialogFooterClass}>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={createMutation.isPending}>
                  Cancelar
                </Button>
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="space-y-3">
        {waitlistQuery.isLoading &&
          Array.from({ length: 4 }).map((_, i) => <AdminWaitlistCardSkeleton key={`wl-sk-${i}`} />)}
        {!waitlistQuery.isLoading && (waitlistQuery.data ?? []).length === 0 && (
          <AdminEmptyState
            icon={Clock}
            title="Ninguém na lista de espera"
            description="Registre clientes que querem um horário e converta em agendamento quando surgir vaga."
            action={
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background"
              >
                Adicionar
              </button>
            }
          />
        )}
        {!waitlistQuery.isLoading &&
          (waitlistQuery.data ?? []).map((e: any) => (
          <div key={e.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-medium">{e.client?.name ?? "Cliente"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {e.service?.name ?? "Serviço"} · deseja em{" "}
                  {e.desired_date ? new Date(e.desired_date).toLocaleDateString("pt-BR") : "—"}
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-success">
                  <MessageCircle className="size-3" /> {e.client?.whatsapp ?? "—"}
                </div>
              </div>
              <div className="flex gap-2">
                <Dialog open={convertOpenId === e.id} onOpenChange={(o) => setConvertOpenId(o ? e.id : null)}>
                  <DialogTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs text-background">
                      <Calendar className="size-3.5" /> Converter em agendamento
                    </button>
                  </DialogTrigger>
                  <DialogContent className={adminMobileDialogContentClass}>
                    <DialogHeader className={adminMobileDialogHeaderClass}>
                      <DialogTitle>Converter em agendamento</DialogTitle>
                      <DialogDescription>Escolha o horário para agendar na data desejada.</DialogDescription>
                    </DialogHeader>
                    <div className={adminMobileDialogBodyClass}>
                      <label className="grid gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">Horário</span>
                        <Input
                          value={form.convert_time}
                          onChange={(ev) => setForm((s) => ({ ...s, convert_time: ev.target.value }))}
                        />
                      </label>
                    </div>
                    <DialogFooter className={adminMobileDialogFooterClass}>
                      <Button variant="outline" onClick={() => setConvertOpenId(null)} disabled={convertMutation.isPending}>
                        Cancelar
                      </Button>
                      <Button onClick={() => convertMutation.mutate(e)} disabled={convertMutation.isPending}>
                        {convertMutation.isPending ? "Convertendo…" : "Converter"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <button
                  onClick={() => removeMutation.mutate(e.id)}
                  className="rounded-full border border-border px-4 py-2 text-xs hover:bg-accent"
                  disabled={removeMutation.isPending}
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
