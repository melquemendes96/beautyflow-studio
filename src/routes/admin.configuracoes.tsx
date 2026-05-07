import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin/configuracoes")({
  component: Config,
});

const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function Config() {
  return (
    <div>
      <PageTitle title="Configurações" subtitle="Ajustes da sua empresa e preferências de agendamento" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Dados da empresa">
          <Field label="Nome fantasia" defaultValue="Joyce Mendes BeautyFlow" />
          <Field label="CNPJ" defaultValue="12.345.678/0001-90" />
          <Field label="E-mail de contato" defaultValue="contato@joycemendes.com" />
          <Field label="Telefone" defaultValue="(11) 91234-5678" />
        </Section>

        <Section title="Horário de funcionamento">
          <div className="space-y-2">
            {dias.map((d, i) => (
              <div key={d} className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-sm">
                <div className="flex items-center gap-3">
                  <input type="checkbox" defaultChecked={i < 6} className="size-4 accent-foreground" />
                  <span className="font-medium">{d}</span>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <input defaultValue="09:00" className="w-16 rounded-md border border-input bg-background px-2 py-1" />
                  <span>às</span>
                  <input defaultValue="19:00" className="w-16 rounded-md border border-input bg-background px-2 py-1" />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Regras de agendamento">
          <Field label="Intervalo padrão entre atendimentos (min)" defaultValue="15" />
          <Field label="Prazo mínimo para agendar (horas)" defaultValue="2" />
          <Field label="Prazo máximo de cancelamento (horas)" defaultValue="6" />
        </Section>

        <Section title="Recursos">
          {[
            ["Permitir reagendamento pelo cliente", true],
            ["Permitir lista de espera", true],
            ["Solicitar confirmação 24h antes", true],
            ["Modo férias (pausar agenda)", false],
          ].map(([l, on]) => (
            <div key={l as string} className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
              <span className="text-sm">{l}</span>
              <div className={`relative h-6 w-11 rounded-full transition ${on ? "bg-foreground" : "bg-muted"}`}>
                <div className={`absolute top-0.5 size-5 rounded-full bg-background transition ${on ? "left-5" : "left-0.5"}`} />
              </div>
            </div>
          ))}
        </Section>
      </div>

      <div className="mt-6 flex justify-end">
        <button className="rounded-full bg-foreground px-6 py-3 text-sm text-background">Salvar configurações</button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <h2 className="mb-4 font-display text-lg">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input defaultValue={defaultValue} className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground" />
    </label>
  );
}
