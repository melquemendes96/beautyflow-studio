import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { anamnesisService, type AnamnesisField } from "@/services/anamnesisService";
import { toast } from "sonner";
import { ClipboardList, Link2 } from "lucide-react";

type Props = {
  companyId: string;
  clientId: string;
  companySlug?: string | null;
  enabled: boolean;
};

const DEFAULT_FIELDS: AnamnesisField[] = [
  { id: "alergias", type: "text", label: "Possui alergias? Quais?", required: true },
  { id: "medicamentos", type: "text", label: "Usa medicamentos contínuos?", required: false },
  { id: "gestante", type: "boolean", label: "Está gestante ou amamentando?", required: true },
  { id: "problemas_saude", type: "text", label: "Problemas de saúde relevantes?", required: false },
  { id: "procedimentos_recentes", type: "text", label: "Procedimentos recentes?", required: false },
  { id: "observacoes", type: "text", label: "Observações", required: false },
];

export function ClientAnamnesisPanel({ companyId, clientId, companySlug, enabled }: Props) {
  const queryClient = useQueryClient();
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["admin", "anamnesis", companyId, clientId],
    enabled: enabled && Boolean(companyId) && Boolean(clientId),
    queryFn: async () => {
      const res = await anamnesisService.listForClient(companyId, clientId);
      if (res.error) throw res.error;
      return res.data as {
        ok?: boolean;
        items?: Array<{
          id: string;
          template_name?: string;
          answers?: Record<string, unknown>;
          filled_by?: string;
          submitted_at?: string;
        }>;
        is_valid?: boolean;
        error?: string;
      };
    },
  });

  const items = listQuery.data?.items ?? [];
  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const linkMutation = useMutation({
    mutationFn: async () => {
      const res = await anamnesisService.staffCreateLink(companyId, clientId);
      if (res.error) throw res.error;
      const d = res.data as { ok?: boolean; access_token?: string; slug?: string; error?: string };
      if (!d?.ok || !d.access_token) throw new Error(d?.error ?? "Falha ao gerar link");
      const slug = companySlug || d.slug || "";
      const path = `${window.location.origin}/anamnese/${encodeURIComponent(slug)}?t=${d.access_token}`;
      await navigator.clipboard.writeText(path);
      return path;
    },
    onSuccess: () => toast.success("Link de anamnese copiado."),
    onError: (e: Error) => toast.error(e.message),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await anamnesisService.staffSubmit(companyId, clientId, answers);
      if (res.error) throw res.error;
      const d = res.data as { ok?: boolean; error?: string };
      if (!d?.ok) throw new Error(d?.error ?? "Falha ao salvar");
    },
    onSuccess: async () => {
      toast.success("Anamnese registrada pela equipe.");
      setShowStaffForm(false);
      setAnswers({});
      await queryClient.invalidateQueries({ queryKey: ["admin", "anamnesis", companyId, clientId] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "clients", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!enabled) return null;

  return (
    <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="inline-flex items-center gap-1.5 text-sm font-medium">
            <ClipboardList className="size-4" /> Anamnese
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {listQuery.data?.is_valid
              ? "Ficha válida no período configurado."
              : items.length
                ? "Ficha vencida ou incompleta — peça atualização."
                : "Nenhuma ficha ainda."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1"
          disabled={linkMutation.isPending}
          onClick={() => linkMutation.mutate()}
        >
          <Link2 className="size-3.5" /> Copiar link
        </Button>
      </div>

      {listQuery.isLoading ? <p className="mt-3 text-xs text-muted-foreground">Carregando…</p> : null}

      {items.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1">
            {items.slice(0, 5).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  (selected?.id ?? "") === item.id ? "border-foreground bg-foreground text-background" : ""
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString("pt-BR") : "—"}
                {item.filled_by === "staff" ? " · equipe" : ""}
              </button>
            ))}
          </div>
          {selected?.answers ? (
            <div className="rounded-lg border bg-background p-3 text-xs space-y-1.5">
              {Object.entries(selected.answers).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-right font-medium">{formatAnswer(v)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => setShowStaffForm((s) => !s)}>
          {showStaffForm ? "Fechar formulário" : "Preencher pela recepção"}
        </Button>
      </div>

      {showStaffForm ? (
        <div className="mt-3 space-y-3 rounded-lg border bg-background p-3">
          {DEFAULT_FIELDS.map((f) => (
            <label key={f.id} className="grid gap-1 text-xs">
              {f.label}
              {f.type === "boolean" ? (
                <select
                  className="h-9 rounded-md border px-2"
                  value={answers[f.id] === true ? "sim" : "nao"}
                  onChange={(e) => setAnswers((s) => ({ ...s, [f.id]: e.target.value === "sim" }))}
                >
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              ) : (
                <Input
                  value={String(answers[f.id] ?? "")}
                  onChange={(e) => setAnswers((s) => ({ ...s, [f.id]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <Button
            type="button"
            size="sm"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            {submitMutation.isPending ? "Salvando…" : "Salvar anamnese"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function formatAnswer(v: unknown): string {
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v == null || v === "") return "—";
  return String(v);
}
