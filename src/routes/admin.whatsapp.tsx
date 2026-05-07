import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { MessageCircle, Send, CheckCircle, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/admin/whatsapp")({
  component: WhatsApp,
});

function WhatsApp() {
  return (
    <div>
      <PageTitle title="WhatsApp Oficial" subtitle="Conecte sua conta oficial do WhatsApp Business para enviar confirmações e lembretes automáticos." />

      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4 text-sm">
        <AlertCircle className="size-5 text-warning shrink-0" />
        <div>
          <div className="font-medium">Status: Não configurado</div>
          <div className="text-xs text-muted-foreground">A integração será feita pela API oficial da Meta.</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h2 className="font-display text-xl">Credenciais Meta Cloud API</h2>
          {[
            { l: "Meta Business ID", p: "1234567890" },
            { l: "Phone Number ID", p: "987654321" },
            { l: "Access Token", p: "EAAG••••••••••••" },
            { l: "Número exibido", p: "+55 11 91234-5678" },
            { l: "Webhook Verify Token", p: "minha_chave_secreta" },
          ].map((f) => (
            <label key={f.l} className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{f.l}</span>
              <input placeholder={f.p} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground" />
            </label>
          ))}

          <div className="flex flex-wrap gap-2 pt-2">
            <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm text-background">Salvar conexão</button>
            <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-5 py-2.5 text-sm hover:bg-accent">
              <Send className="size-4" /> Testar envio
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-full bg-success px-5 py-2.5 text-sm text-background">
              <CheckCircle className="size-4" /> Ativar WhatsApp
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { l: "Mensagens enviadas", v: "0", c: "text-info" },
            { l: "Confirmações de agendamento", v: "0", c: "text-success" },
            { l: "Lembretes 24h antes", v: "0", c: "text-purple-soft" },
            { l: "Falhas de envio", v: "0", c: "text-destructive" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.l}</span>
                <MessageCircle className={`size-4 ${s.c}`} />
              </div>
              <div className="mt-2 font-display text-3xl">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
