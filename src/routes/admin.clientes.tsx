import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Search, Plus, Users } from "lucide-react";
import { AdminEmptyState, AdminTableRowSkeleton } from "@/components/admin/AdminPageStates";
import { useCurrentCompany } from "@/lib/current-company";
import { clientService } from "@/services/clientService";
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
  adminMobileDialogBodyClass,
  adminMobileDialogContentClass,
  adminMobileDialogFooterClass,
  adminMobileDialogHeaderClass,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/clientes")({
  component: Clientes,
});

function Clientes() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "", notes: "" });

  const clientsQuery = useQuery({
    queryKey: ["admin", "clients", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await clientService.listByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = clientsQuery.data ?? [];
    if (!term) return list;
    return list.filter((c: any) => {
      return (
        String(c.name ?? "").toLowerCase().includes(term) ||
        String(c.email ?? "").toLowerCase().includes(term) ||
        String(c.whatsapp ?? "").toLowerCase().includes(term)
      );
    });
  }, [clientsQuery.data, q]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        whatsapp: form.whatsapp.trim() || undefined,
        notes: form.notes.trim() || null,
      };
      if (!payload.name) throw new Error("Nome obrigatório");

      if (editing?.id) {
        const res = await clientService.update(companyId, editing.id, {
          name: payload.name,
          email: payload.email ?? null,
          whatsapp: payload.whatsapp ?? null,
          notes: payload.notes,
        });
        if (res.error) throw res.error;
        return res.data;
      }

      const res = await clientService.create(companyId, payload);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm({ name: "", email: "", whatsapp: "", notes: "" });
      await queryClient.invalidateQueries({ queryKey: ["admin", "clients", companyId] });
      toast.success("Cliente salvo com sucesso");
    },
  });

  const beginCreate = () => {
    setEditing(null);
    setForm({ name: "", email: "", whatsapp: "", notes: "" });
    setOpen(true);
  };

  const beginEdit = (c: any) => {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      email: c.email ?? "",
      whatsapp: c.whatsapp ?? "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageTitle
        title="Clientes"
        subtitle={
          clientsQuery.isLoading
            ? "Carregando…"
            : `${filtered.length} cadastradas`
        }
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                onClick={beginCreate}
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background"
              >
                <Plus className="size-4" /> Nova cliente
              </button>
            </DialogTrigger>
            <DialogContent className={adminMobileDialogContentClass}>
              <DialogHeader className={adminMobileDialogHeaderClass}>
                <DialogTitle>{editing ? "Editar cliente" : "Nova cliente"}</DialogTitle>
                <DialogDescription>Cadastro de clientes da sua empresa.</DialogDescription>
              </DialogHeader>

              <div className={adminMobileDialogBodyClass}>
                <div className="grid gap-3">
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Nome</span>
                    <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">E-mail</span>
                      <Input value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">WhatsApp</span>
                      <Input value={form.whatsapp} onChange={(e) => setForm((s) => ({ ...s, whatsapp: e.target.value }))} />
                    </label>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Observações</span>
                    <Input value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} />
                  </label>
                </div>

                {saveMutation.error && (
                  <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    Não foi possível salvar. Verifique os campos e tente novamente.
                  </div>
                )}
              </div>

              <DialogFooter className={adminMobileDialogFooterClass}>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saveMutation.isPending}>
                  Cancelar
                </Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 relative">
        <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Buscar por nome, e-mail ou WhatsApp"
          className="w-full rounded-full border border-input bg-card py-3 pl-11 pr-4 text-sm outline-none focus:border-foreground"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="-mx-1 overflow-x-auto rounded-2xl border border-border bg-card px-1 shadow-soft sm:mx-0 sm:px-0">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left hidden md:table-cell">Contato</th>
              <th className="px-4 py-3 text-center">Cadastro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clientsQuery.isLoading &&
              Array.from({ length: 6 }).map((_, i) => <AdminTableRowSkeleton key={`sk-${i}`} cols={3} />)}
            {!clientsQuery.isLoading &&
              (filtered ?? []).map((c: any) => (
                <tr
                  key={c.id}
                  className="hover:bg-accent/40 transition cursor-pointer"
                  onClick={() => beginEdit(c)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-full bg-gradient-to-br from-gold to-rose grid place-items-center text-xs text-background font-medium">
                        {String(c.name ?? "")
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground md:hidden">{c.whatsapp ?? "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                    <div>{c.email ?? "—"}</div>
                    <div className="text-xs">{c.whatsapp ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            {!clientsQuery.isLoading && filtered.length === 0 && (
              <tr>
                <td className="p-0" colSpan={3}>
                  <div className="p-4">
                    <AdminEmptyState
                      icon={Users}
                      title={q.trim() ? "Nenhum resultado" : "Nenhuma cliente ainda"}
                      description={
                        q.trim()
                          ? "Tente outro termo na busca ou limpe o filtro."
                          : "Cadastre sua primeira cliente para organizar contatos e histórico."
                      }
                      action={
                        !q.trim() ? (
                          <button
                            type="button"
                            onClick={beginCreate}
                            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background"
                          >
                            <Plus className="size-4" /> Nova cliente
                          </button>
                        ) : undefined
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
  );
}
