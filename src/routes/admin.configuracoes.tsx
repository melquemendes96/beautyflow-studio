import { createFileRoute } from "@tanstack/react-router";
import { PageTitle } from "@/components/admin/AdminShell";
import { useEffect, useMemo, useState } from "react";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { businessSettingsService } from "@/services/businessSettingsService";
import { companyService } from "@/services/companyService";
import { toast } from "sonner";
import { AdminConfigSectionSkeleton } from "@/components/admin/AdminPageStates";
import { Copy, ExternalLink } from "lucide-react";
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from "@/lib/public-booking-slug";

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

  const companyQuery = useQuery({
    queryKey: ["admin", "company", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await companyService.getByIdForAdmin(companyId!);
      if (res.error) throw res.error;
      return res.data ?? null;
    },
  });

  const [slugInput, setSlugInput] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(typeof window !== "undefined" ? window.location.origin : "");
  }, []);

  useEffect(() => {
    const s = companyQuery.data?.slug;
    if (typeof s === "string" && s.length > 0) setSlugInput(s);
  }, [companyQuery.data?.slug]);

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

  const normalizedSlug = useMemo(() => normalizePublicBookingSlug(slugInput), [slugInput]);
  const bookingPath = `/agendar/${encodeURIComponent(normalizedSlug || "exemplo")}`;
  const bookingFullUrl = origin ? `${origin}${bookingPath}` : bookingPath;

  const copyBookingLink = async () => {
    if (!normalizedSlug || !isValidPublicBookingSlug(normalizedSlug)) {
      toast.error("Defina um slug válido antes de copiar o link.");
      return;
    }
    const toCopy = origin ? `${origin}/agendar/${encodeURIComponent(normalizedSlug)}` : bookingPath;
    try {
      await navigator.clipboard.writeText(toCopy);
      toast.success("Link copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente o texto acima.");
    }
  };

  const pageLoading = settingsQuery.isLoading || companyQuery.isLoading;

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
      const slugNorm = normalizePublicBookingSlug(slugInput);
      if (!isValidPublicBookingSlug(slugNorm)) {
        throw new Error(
          "Informe um slug válido: letras minúsculas, números e hífens (ex.: studio-beleza ou joyce2024).",
        );
      }

      const currentSlug = companyQuery.data?.slug ?? "";
      const slugChanges = Number(companyQuery.data?.slug_change_count ?? 0);
      if (slugNorm !== currentSlug) {
        if (slugChanges >= 1) {
          throw new Error(
            "Você já alterou o slug público uma vez neste ciclo. Entre em contato com o suporte se precisar mudar novamente.",
          );
        }
        const companyRes = await companyService.updateForAdmin(companyId, {
          slug: slugNorm,
          slug_change_count: slugChanges + 1,
        });
        if (companyRes.error) {
          const code = (companyRes.error as { code?: string })?.code;
          if (code === "23505") {
            throw new Error("Este slug já está em uso por outra empresa. Escolha outro.");
          }
          throw companyRes.error;
        }
      }

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
      await queryClient.invalidateQueries({ queryKey: ["admin", "company", companyId] });
      toast.success("Configurações salvas com sucesso");
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string"
          ? (err as { message: string }).message
          : "Não foi possível salvar.";
      toast.error(msg);
    },
  });

  return (
    <div>
      <PageTitle title="Configurações" subtitle="Ajustes da sua empresa e preferências de agendamento" />

      {(settingsQuery.isError || companyQuery.isError) && (
        <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Não foi possível carregar as configurações. Verifique sua conexão e tente novamente.
        </div>
      )}

      {pageLoading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <AdminConfigSectionSkeleton rows={4} />
          <AdminConfigSectionSkeleton rows={5} />
          <AdminConfigSectionSkeleton rows={3} />
          <AdminConfigSectionSkeleton rows={4} />
        </div>
      ) : (
        <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Página pública de agendamento">
          <p className="text-sm text-muted-foreground">
            Este é o link que você pode enviar para suas clientes agendarem online. O slug é a parte final da URL —
            você pode escolher outro (único na plataforma) e salvar junto com as demais configurações.
          </p>
          {companyQuery.data?.name ? (
            <p className="text-xs text-muted-foreground">
              Empresa: <span className="font-medium text-foreground">{companyQuery.data.name}</span>
            </p>
          ) : null}
          <div className="rounded-xl border border-border bg-secondary/30 px-3 py-2.5 font-mono text-xs leading-relaxed break-all text-foreground">
            {bookingFullUrl}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyBookingLink()}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium transition hover:bg-secondary"
            >
              <Copy className="size-3.5" />
              Copiar link
            </button>
            {normalizedSlug && isValidPublicBookingSlug(normalizedSlug) ? (
              <a
                href={origin ? `${origin}/agendar/${encodeURIComponent(normalizedSlug)}` : bookingPath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-medium transition hover:bg-secondary"
              >
                <ExternalLink className="size-3.5" />
                Abrir página
              </a>
            ) : null}
          </div>
          <Field
            label="Slug do link (personalize como quiser)"
            value={slugInput}
            onChange={(v) => setSlugInput(v)}
          />
          <p className="text-[11px] text-muted-foreground">
            Use apenas letras minúsculas, números e hífens. Você pode alterar o slug{" "}
            <span className="font-medium text-foreground">apenas uma vez</span> por ciclo de assinatura — atualize links
            já divulgados após salvar.
          </p>
          {Number(companyQuery.data?.slug_change_count ?? 0) >= 1 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              O slug já foi alterado uma vez. Para mudar de novo, fale com o suporte.
            </p>
          ) : null}
          {slugInput.trim().length > 0 && !isValidPublicBookingSlug(normalizedSlug) ? (
            <p className="text-xs text-destructive">
              Slug inválido após normalização. Remova caracteres especiais ou espaços soltos.
            </p>
          ) : null}
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
          disabled={saveMutation.isPending || pageLoading}
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
