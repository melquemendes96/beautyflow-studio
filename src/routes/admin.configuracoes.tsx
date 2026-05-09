import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { useEffect, useMemo, useState } from "react";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessSettingsService } from "@/services/businessSettingsService";
import { toast } from "sonner";
import { AdminConfigSectionSkeleton } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/admin/configuracoes")({
  component: Config,
});

const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function Config() {
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();

  const settingsQuery = useQuery({
    queryKey: ["admin", "business_settings", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await businessSettingsService.getByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const [workingDays, setWorkingDays] = useState<boolean[]>([true, true, true, true, true, true, false]);
  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("19:00");
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState("15");
  const [minScheduleNoticeHours, setMinScheduleNoticeHours] = useState("2");
  const [cancellationLimitHours, setCancellationLimitHours] = useState("6");
  const [allowReschedule, setAllowReschedule] = useState(true);
  const [allowWaitlist, setAllowWaitlist] = useState(true);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const d: any = settingsQuery.data;
    setWorkingDays(Array.isArray(d.working_days) && d.working_days.length === 7 ? d.working_days : [true, true, true, true, true, true, false]);
    setOpeningTime(d.opening_time ?? "09:00");
    setClosingTime(d.closing_time ?? "19:00");
    setSlotIntervalMinutes(String(d.slot_interval_minutes ?? 15));
    setMinScheduleNoticeHours(String(d.min_schedule_notice_hours ?? 2));
    setCancellationLimitHours(String(d.cancellation_limit_hours ?? 6));
    setAllowReschedule(Boolean(d.allow_reschedule ?? true));
    setAllowWaitlist(Boolean(d.allow_waitlist ?? true));
  }, [settingsQuery.data]);

  const resources = useMemo(
    () => [
      { label: "Permitir reagendamento pelo cliente", value: allowReschedule, set: setAllowReschedule },
      { label: "Permitir lista de espera", value: allowWaitlist, set: setAllowWaitlist },
    ],
    [allowReschedule, allowWaitlist],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await businessSettingsService.upsert(companyId, {
        working_days: workingDays,
        opening_time: openingTime,
        closing_time: closingTime,
        slot_interval_minutes: Number(slotIntervalMinutes),
        min_schedule_notice_hours: Number(minScheduleNoticeHours),
        cancellation_limit_hours: Number(cancellationLimitHours),
        allow_reschedule: allowReschedule,
        allow_waitlist: allowWaitlist,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "business_settings", companyId] });
      toast.success("Configurações salvas com sucesso");
    },
  });

  return (
    <div>
      <PageTitle title="Configurações" subtitle="Ajustes da sua empresa e preferências de agendamento" />

      {settingsQuery.isError && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar as configurações. Verifique sua conexão e tente novamente.
        </div>
      )}

      {settingsQuery.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminConfigSectionSkeleton rows={4} />
          <AdminConfigSectionSkeleton rows={5} />
          <AdminConfigSectionSkeleton rows={3} />
          <AdminConfigSectionSkeleton rows={4} />
        </div>
      ) : (
        <>
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
                  <input
                    type="checkbox"
                    checked={workingDays[i] ?? false}
                    onChange={(e) =>
                      setWorkingDays((prev) => {
                        const next = prev.slice();
                        next[i] = e.target.checked;
                        return next;
                      })
                    }
                    className="size-4 accent-foreground"
                  />
                  <span className="font-medium">{d}</span>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <input
                    value={openingTime}
                    onChange={(e) => setOpeningTime(e.target.value)}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1"
                  />
                  <span>às</span>
                  <input
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1"
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Regras de agendamento">
          <Field label="Intervalo padrão entre atendimentos (min)" value={slotIntervalMinutes} onChange={setSlotIntervalMinutes} />
          <Field label="Prazo mínimo para agendar (horas)" value={minScheduleNoticeHours} onChange={setMinScheduleNoticeHours} />
          <Field label="Prazo máximo de cancelamento (horas)" value={cancellationLimitHours} onChange={setCancellationLimitHours} />
        </Section>

        <Section title="Recursos">
          {resources.map((r) => (
            <div key={r.label} className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
              <span className="text-sm">{r.label}</span>
              <button
                type="button"
                className={`relative h-6 w-11 rounded-full transition ${r.value ? "bg-foreground" : "bg-muted"}`}
                onClick={() => r.set(!r.value)}
              >
                <div className={`absolute top-0.5 size-5 rounded-full bg-background transition ${r.value ? "left-5" : "left-0.5"}`} />
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 opacity-60">
            <span className="text-sm">Solicitar confirmação 24h antes</span>
            <div className="relative h-6 w-11 rounded-full bg-muted">
              <div className="absolute left-0.5 top-0.5 size-5 rounded-full bg-background" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3 opacity-60">
            <span className="text-sm">Modo férias (pausar agenda)</span>
            <div className="relative h-6 w-11 rounded-full bg-muted">
              <div className="absolute left-0.5 top-0.5 size-5 rounded-full bg-background" />
            </div>
          </div>
        </Section>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || settingsQuery.isLoading}
          className="rounded-full bg-foreground px-6 py-3 text-sm text-background disabled:opacity-60"
        >
          {saveMutation.isPending ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
        </>
      )}
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

function Field({
  label,
  defaultValue,
  value,
  onChange,
}: {
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {value !== undefined ? (
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground"
        />
      ) : (
        <input
          defaultValue={defaultValue}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground"
        />
      )}
    </label>
  );
}
