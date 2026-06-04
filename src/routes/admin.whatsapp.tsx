import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildMetaWebhookUrl,
  whatsappService,
  type WhatsappConnectionStatus,
  type WhatsappMessageLogRow,
  type WhatsappSetupStatus,
  type WhatsappTemplateRow,
} from "@/services/whatsappService";
import { BookOpen, Check, Circle, Copy, MessageCircle, RefreshCw, Shield, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/whatsapp")({
  component: WhatsAppAdmin,
});

function WhatsAppAdmin() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();

  const connectionQuery = useQuery({
    queryKey: ["admin", "whatsapp", "connection", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await whatsappService.getConnection(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const statsQuery = useQuery({
    queryKey: ["admin", "whatsapp", "stats", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await whatsappService.getStats(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const templatesQuery = useQuery({
    queryKey: ["admin", "whatsapp", "templates", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await whatsappService.listTemplates(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const setupQuery = useQuery({
    queryKey: ["admin", "whatsapp", "setup", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await whatsappService.getSetupStatus(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const logsQuery = useQuery({
    queryKey: ["admin", "whatsapp", "logs", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await whatsappService.listMessageLogs(companyId!, 40);
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const [form, setForm] = useState({
    businessId: "",
    phoneNumberId: "",
    displayPhoneNumber: "",
    webhookVerifyToken: "",
    accessToken: "",
    status: "pending" as WhatsappConnectionStatus,
  });

  useEffect(() => {
    const c = connectionQuery.data;
    if (!c) return;
    setForm((prev) => ({
      ...prev,
      businessId: c.business_id ?? "",
      phoneNumberId: c.phone_number_id ?? "",
      displayPhoneNumber: c.display_phone_number ?? "",
      webhookVerifyToken: c.webhook_verify_token ?? "",
      status: c.status,
      accessToken: "",
    }));
  }, [connectionQuery.data]);

  const webhookUrl = companyId ? buildMetaWebhookUrl(companyId) : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("sem_empresa");
      const res = await whatsappService.saveConnection({
        companyId,
        businessId: form.businessId.trim(),
        phoneNumberId: form.phoneNumberId.trim(),
        displayPhoneNumber: form.displayPhoneNumber.trim() || undefined,
        webhookVerifyToken: form.webhookVerifyToken.trim() || undefined,
        accessToken: form.accessToken.trim() || undefined,
        status: form.status,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: () => {
      toast.success("Conexão WhatsApp salva.");
      setForm((f) => ({ ...f, accessToken: "" }));
      void queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Não foi possível salvar.");
    },
  });

  const seedTemplatesMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("sem_empresa");
      const { error } = await whatsappService.seedTemplates(companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Templates padrão criados.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "whatsapp", "templates"] });
    },
    onError: () => toast.error("Não foi possível criar templates."),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("sem_empresa");
      const res = await whatsappService.verifyConnection(companyId);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: (data) => {
      const name = data?.verified_name ? String(data.verified_name) : null;
      toast.success(
        name
          ? `Conexão OK — ${name}`
          : "Conexão com a Meta respondeu corretamente.",
      );
    },
    onError: (e: Error) => {
      toast.error(e.message || "Falha ao testar conexão com a Meta.");
    },
  });

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("URL do webhook copiada.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const stats = statsQuery.data;
  const templates = templatesQuery.data ?? [];
  const setup = setupQuery.data;
  const logs = logsQuery.data ?? [];

  return (
    <div>
      <PageTitle
        title="WhatsApp Oficial"
        subtitle="Meta Cloud API — credenciais, webhook, confirmação e lembretes 24h."
      />

      {setup && <SetupChecklist setup={setup} webhookUrl={webhookUrl} />}

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-secondary/20 p-5 text-sm">
        <Shield className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
        <div>
          <div className="font-medium text-foreground">Token só no servidor</div>
          <p className="mt-1 text-muted-foreground">
            O access token é gravado via RPC segura e nunca é exibido de volta. Use o token permanente da Meta (System
            User ou WhatsApp → API Setup). Enquanto a conta Meta estiver &quot;restrita&quot;, envios falham até a
            verificação da empresa.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h2 className="font-display text-xl">Credenciais Meta</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="WABA ID (business_id)"
              value={form.businessId}
              onChange={(v) => setForm({ ...form, businessId: v })}
              placeholder="985239387537320"
            />
            <Field
              label="Phone Number ID"
              value={form.phoneNumberId}
              onChange={(v) => setForm({ ...form, phoneNumberId: v })}
              placeholder="1062414190297713"
            />
            <Field
              label="Número exibido (opcional)"
              value={form.displayPhoneNumber}
              onChange={(v) => setForm({ ...form, displayPhoneNumber: v })}
              placeholder="+5511999999999"
            />
            <Field
              label="Webhook verify token"
              value={form.webhookVerifyToken}
              onChange={(v) => setForm({ ...form, webhookVerifyToken: v })}
              placeholder="beautyflow_verify_2026"
            />
            <div className="sm:col-span-2">
              <Field
                label="Access token (cole aqui — não será mostrado depois)"
                value={form.accessToken}
                onChange={(v) => setForm({ ...form, accessToken: v })}
                type="password"
                placeholder={
                  connectionQuery.data?.has_access_token
                    ? "••••••••  (deixe vazio para manter o atual)"
                    : "EAAxxxx..."
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status da conexão</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as WhatsappConnectionStatus })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="not_configured">Não configurado</option>
                <option value="pending">Pendente</option>
                <option value="active">Ativo</option>
                <option value="error">Erro</option>
              </select>
            </div>
          </div>

          {webhookUrl && (
            <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-sm">
              <div className="font-medium">URL do webhook (Meta Developer)</div>
              <code className="mt-2 block break-all text-xs text-muted-foreground">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => void copyWebhook()}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-medium hover:bg-accent"
              >
                <Copy className="size-3.5" /> Copiar URL
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saveMutation.isPending || !form.phoneNumberId.trim() || !form.businessId.trim()}
              onClick={() => saveMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm text-background hover:opacity-90 disabled:opacity-40"
            >
              {saveMutation.isPending ? "Salvando…" : "Salvar conexão"}
            </button>
            <button
              type="button"
              disabled={verifyMutation.isPending || !connectionQuery.data?.has_access_token}
              onClick={() => verifyMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm hover:bg-accent disabled:opacity-40"
            >
              <Zap className="size-4" />
              {verifyMutation.isPending ? "Testando…" : "Testar conexão Meta"}
            </button>
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm hover:bg-accent"
            >
              <BookOpen className="size-4" /> Docs Meta
            </a>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { l: "Enviadas (30 dias)", v: stats?.sent ?? "—" },
            { l: "Falhas", v: stats?.failed ?? "—" },
            { l: "Recebidas (inbound)", v: stats?.inbound ?? "—" },
            { l: "Na fila", v: stats?.pending ?? "—" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{s.l}</span>
                <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="mt-2 font-display text-3xl">{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-xl">Histórico de mensagens</h2>
        <p className="mt-1 text-sm text-muted-foreground">Últimos envios, lembretes e falhas (30 dias nas métricas acima).</p>
        {logs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nenhuma mensagem registrada ainda.</p>
        ) : (
          <div className="-mx-1 mt-4 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-2 text-left">Data</th>
                  <th className="py-2 text-left">Tipo</th>
                  <th className="py-2 text-left">Cliente</th>
                  <th className="py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((row) => (
                  <LogRow key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Templates (espelho local)</h2>
          <button
            type="button"
            onClick={() => seedTemplatesMutation.mutate()}
            disabled={seedTemplatesMutation.isPending}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40"
          >
            <RefreshCw className="size-4" />
            Criar padrões
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie e aprove os mesmos nomes no Meta Business Manager. Marque como &quot;approved&quot; aqui após aprovação na
          Meta.
        </p>

        {templates.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Nenhum template cadastrado.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {templates.map((t) => (
              <TemplateRow key={t.id} template={t} companyId={companyId!} onUpdated={() => templatesQuery.refetch()} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SetupChecklist({
  setup,
  webhookUrl,
}: {
  setup: WhatsappSetupStatus;
  webhookUrl: string | null;
}) {
  const c = setup.connection;
  const items = [
    { ok: setup.plan_has_whatsapp, label: "Plano com feature WhatsApp (Elite)" },
    { ok: Boolean(c?.has_business_id && c?.has_phone_number_id), label: "WABA ID e Phone Number ID preenchidos" },
    { ok: Boolean(c?.has_access_token), label: "Access token salvo no servidor" },
    { ok: Boolean(c?.has_verify_token), label: "Webhook verify token definido" },
    { ok: Boolean(webhookUrl), label: "URL do webhook disponível para copiar" },
    { ok: c?.status === "active", label: "Status da conexão = Ativo" },
    { ok: setup.template_confirmation_status === "approved", label: "Template booking_confirmation aprovado (local + Meta)" },
    { ok: setup.template_reminder_status === "approved", label: "Template booking_reminder aprovado (local + Meta)" },
    { ok: setup.ready_to_send, label: "Pronto para enviar confirmações" },
  ];

  return (
    <section className="mb-6 rounded-2xl border border-gold/25 bg-gold-soft/10 p-5">
      <h2 className="font-display text-lg">Checklist Meta (Fase 4)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Verificação da empresa na Meta e templates aprovados são feitos no{" "}
        <a
          href="https://business.facebook.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline"
        >
          Meta Business Manager
        </a>
        . Lembretes 24h rodam via cron — ver <code className="text-xs">docs/WHATSAPP_CRON.md</code>.
      </p>
      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            {item.ok ? (
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LogRow({ row }: { row: WhatsappMessageLogRow }) {
  const when = row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "—";
  const appt =
    row.appointment_date && row.appointment_time
      ? `${new Date(row.appointment_date).toLocaleDateString("pt-BR")} ${row.appointment_time}`
      : null;

  return (
    <tr>
      <td className="py-3 text-muted-foreground">
        <div>{when}</div>
        {appt && <div className="text-xs">{appt}</div>}
      </td>
      <td className="py-3">{row.message_type}</td>
      <td className="py-3">
        <div>{row.client_name ?? "—"}</div>
        {row.service_name && <div className="text-xs text-muted-foreground">{row.service_name}</div>}
      </td>
      <td className="py-3">
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            row.status === "failed"
              ? "bg-destructive/15 text-destructive"
              : row.status === "pending"
                ? "bg-secondary text-muted-foreground"
                : "bg-success/15 text-success"
          }`}
        >
          {row.status}
        </span>
        {row.error_message && (
          <div className="mt-1 max-w-xs truncate text-xs text-destructive" title={row.error_message}>
            {row.error_message}
          </div>
        )}
      </td>
    </tr>
  );
}

function TemplateRow({
  template,
  companyId,
  onUpdated,
}: {
  template: WhatsappTemplateRow;
  companyId: string;
  onUpdated: () => void;
}) {
  const [status, setStatus] = useState(template.status);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await whatsappService.upsertTemplate({
        companyId,
        type: template.type,
        templateName: template.template_name,
        language: template.language,
        bodyPreview: template.body_preview ?? undefined,
        status: status as "draft" | "pending" | "approved" | "rejected",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template atualizado.");
      onUpdated();
    },
    onError: () => toast.error("Erro ao atualizar template."),
  });

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div>
        <div className="font-medium">{template.template_name}</div>
        <div className="text-xs text-muted-foreground">
          {template.type} · {template.language}
        </div>
        {template.body_preview && (
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">{template.body_preview}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
        >
          <option value="draft">draft</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
        </select>
        <button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent"
        >
          Salvar
        </button>
      </div>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"
      />
    </div>
  );
}
