import { createFileRoute } from "@tanstack/react-router";
import { MasterPageTitle } from "@/components/master/MasterShell";
import { Settings, CreditCard, Bell, Shield, ExternalLink } from "lucide-react";
import { AdminConfigSectionSkeleton } from "@/components/admin/AdminPageStates";
import { useState } from "react";

export const Route = createFileRoute("/master/configuracoes")({
  component: MasterConfiguracoes,
});

function MasterConfiguracoes() {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="space-y-8">
      <MasterPageTitle
        title="Configurações da plataforma"
        subtitle="Parâmetros globais do SaaS. Leitura e edição completa entram nas próximas entregas."
      />

      <div
        role="status"
        className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-soft"
      >
        <p>
          O painel master já lê empresas, planos, assinaturas e pagamentos no Supabase. Use esta página como
          âncora para futuras chaves de ambiente, webhooks e políticas exibidas aos tenants.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-foreground">
              <Settings className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg text-foreground">Identidade e URLs</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Nome da plataforma, domínio de agendamento público e textos legais exibidos na landing.
              </p>
              <p className="mt-3 inline-flex rounded-full bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                Em breve
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-foreground">
              <CreditCard className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg text-foreground">Cobrança e gateways</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Chaves Mercado Pago, moeda padrão, dias de trial e regras de renovação automática.
              </p>
              <p className="mt-3 inline-flex rounded-full bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                Em breve
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-foreground">
              <Bell className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg text-foreground">Notificações</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Modelos de e-mail, lembretes de agendamento e integrações de mensagens (ex.: WhatsApp).
              </p>
              <p className="mt-3 inline-flex rounded-full bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                Em breve
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gold-soft text-foreground">
              <Shield className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg text-foreground">Segurança e auditoria</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                IPs permitidos para webhooks, log de ações master e políticas de sessão.
              </p>
              <p className="mt-3 inline-flex rounded-full bg-secondary/80 px-3 py-1 text-xs font-medium text-muted-foreground">
                Em breve
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg text-foreground">Pré-visualização do formulário</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Placeholder visual alinhado ao padrão de carregamento do admin (quando os campos existirem).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="shrink-0 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            {showPreview ? "Ocultar skeleton" : "Ver skeleton"}
          </button>
        </div>
        {showPreview ? (
          <div className="mt-6 space-y-4">
            <AdminConfigSectionSkeleton rows={3} />
            <AdminConfigSectionSkeleton rows={2} />
          </div>
        ) : null}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Variáveis e funções: use <span className="font-mono text-foreground">.env.example</span> e{" "}
        <span className="font-mono text-foreground">SUPABASE_SETUP.md</span> no repositório. Referência:{" "}
        <a
          href="https://supabase.com/docs/guides/api"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          API Supabase <ExternalLink className="inline size-3 opacity-70" aria-hidden />
        </a>
      </p>
    </div>
  );
}
