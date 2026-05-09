import { createFileRoute, Link } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { MessageCircle, BookOpen, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/whatsapp")({
  component: WhatsApp,
});

function WhatsApp() {
  return (
    <div>
      <PageTitle
        title="WhatsApp Oficial"
        subtitle="Confirmações e lembretes automáticos via WhatsApp Business (Meta Cloud API)."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-secondary/20 p-5 text-sm">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-gold" aria-hidden />
        <div>
          <div className="font-medium text-foreground">Integração em desenvolvimento</div>
          <p className="mt-1 text-muted-foreground">
            Esta tela está preparada para credenciais da Meta (Business ID, Phone Number ID, token e webhook). Nenhum dado
            sensível é armazenado no navegador até a funcionalidade ser liberada.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-dashed border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h2 className="font-display text-xl">O que virá nesta área</h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
            <li>Cadastro seguro das credenciais da Meta Cloud API (lado servidor).</li>
            <li>Webhook de mensagens com verificação e assinatura.</li>
            <li>Envio de confirmação de agendamento e lembretes (conforme políticas da Meta).</li>
            <li>Métricas de entregas e falhas por empresa (multi-tenant).</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-4">
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium hover:bg-accent"
            >
              <BookOpen className="size-4" aria-hidden />
              Documentação Meta
            </a>
            <Link
              to="/admin/configuracoes"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm text-background hover:opacity-90"
            >
              Regras de agendamento
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            Enquanto isso, use o WhatsApp manualmente ou integre automações externas; a agenda e os clientes já podem ser
            gerenciados no painel.
          </p>
        </div>

        <div className="space-y-4">
          {[
            { l: "Mensagens enviadas", v: "—", hint: "Em breve" },
            { l: "Confirmações de agendamento", v: "—", hint: "Em breve" },
            { l: "Lembretes automáticos", v: "—", hint: "Em breve" },
            { l: "Falhas de envio", v: "—", hint: "Em breve" },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-border bg-card p-5 shadow-soft opacity-90">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{s.l}</span>
                <MessageCircle className="size-4 text-muted-foreground" aria-hidden />
              </div>
              <div className="mt-2 font-display text-3xl text-muted-foreground">{s.v}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{s.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
