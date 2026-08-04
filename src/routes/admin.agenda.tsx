import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Lock, Plus } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { useCurrentCompany } from "@/lib/current-company";
import { hasFeatureAccess } from "@/lib/plan-access";
import { ComandaDrawer } from "@/components/admin/ComandaDrawer";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentService } from "@/services/appointmentService";
import { packageService, type ClientPackageRow } from "@/services/packageService";
import { formatTabMoney, tabService } from "@/services/tabService";
import { cashService } from "@/services/cashService";
import { scheduleBlockService } from "@/services/scheduleBlockService";
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
import { AdminAgendaDaySlotSkeleton, AdminAgendaWeekGridSkeleton } from "@/components/admin/AdminPageStates";
import { ProviderAgendaAvatar, providerAgendaLabel } from "@/components/admin/ProviderAgendaAvatar";
import {
  clientContactLine,
  compareAppointmentTime,
  formatAppointmentDateYmd,
  formatAppointmentTimeHm,
} from "@/lib/appointment-time";
import { formatSupabaseApiError } from "@/lib/format-supabase-api-error";
import {
  blocksForAgendaScope,
  findCoveringBlockForHour,
  findManualBlockForHour,
  hasBlockType,
  hourSlotEnd,
  isHourBlocked,
  blockScopeLabel,
  type ScheduleBlockRow,
} from "@/lib/admin-agenda-blocks";
import {
  DEFAULT_CLOSING_TIME,
  DEFAULT_OPENING_TIME,
  DEFAULT_WORKING_DAYS,
  buildAgendaHourSlots,
  formatPublicHoursText,
  isWorkingDate,
  normalizeTimeHm,
  normalizeWorkingDays,
} from "@/lib/business-hours";
import { businessSettingsService } from "@/services/businessSettingsService";
import { teamService } from "@/services/teamService";
import type { ScheduleBlockType } from "@/services/scheduleBlockService";

export const Route = createFileRoute("/admin/agenda")({
  validateSearch: (s: Record<string, unknown>) => ({
    provider: typeof s.provider === "string" ? s.provider : undefined,
  }),
  component: Agenda,
});

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const statusClass: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground",
  confirmed: "bg-foreground text-background",
  completed: "bg-success/90 text-background",
  cancelled: "bg-warning/90 text-background",
  no_show: "bg-destructive/90 text-background",
};

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date) {
  // segunda-feira como início
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0=segunda ... 6=domingo
  d.setDate(d.getDate() - day);
  return d;
}

function mutationErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  return formatSupabaseApiError(err) || fallback;
}

function Agenda() {
  const [view, setView] = useState<"dia" | "semana">("dia");
  const queryClient = useQueryClient();
  const { companyId, hasCompany, providerId, isProvider, isOwnerAdmin } = useCurrentCompany();
  const { provider: providerFromSearch } = Route.useSearch();
  const [day, setDay] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    service_id: "",
    time: "09:00",
  });
  const [providerFilterId, setProviderFilterId] = useState("");
  const [comandaAppointmentId, setComandaAppointmentId] = useState<string | null>(null);

  useEffect(() => {
    if (isProvider && providerId) {
      setProviderFilterId(providerId);
      return;
    }
    setProviderFilterId(providerFromSearch ?? "");
  }, [isProvider, providerId, providerFromSearch]);

  const dateYmd = useMemo(() => toYmd(day), [day]);
  const dateLabel = useMemo(
    () =>
      day.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }),
    [day],
  );

  const teamFeatureQuery = useQuery({
    queryKey: ["admin", "feature", "team", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: () => hasFeatureAccess(companyId!, "team"),
  });

  const cashQuery = useQuery({
    queryKey: ["admin", "cash-register", companyId],
    enabled: hasCompany && Boolean(companyId) && isOwnerAdmin,
    queryFn: () => cashService.getStatus(companyId!),
    staleTime: 10_000,
  });

  const packagesFeatureQuery = useQuery({
    queryKey: ["admin", "feature", "packages", companyId],
    enabled: hasCompany && Boolean(companyId),
    queryFn: () => hasFeatureAccess(companyId!, "packages"),
  });
  const packagesEnabled = Boolean(packagesFeatureQuery.data);

  const packagesQuery = useQuery({
    queryKey: ["admin", "packages", "list", companyId, "all"],
    enabled: hasCompany && Boolean(companyId) && packagesEnabled,
    queryFn: async () => {
      const res = await packageService.listByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    staleTime: 15_000,
  });

  const packageById = useMemo(() => {
    const map = new Map<string, ClientPackageRow>();
    for (const pkg of packagesQuery.data ?? []) map.set(pkg.id, pkg);
    return map;
  }, [packagesQuery.data]);

  const tabsQuery = useQuery({
    queryKey: ["admin", "tabs", companyId, dateYmd],
    enabled: hasCompany && Boolean(companyId),
    queryFn: async () => {
      const res = await tabService.listForDate(companyId!, dateYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    staleTime: 10_000,
  });

  const tabByAppointmentId = useMemo(() => {
    const map = new Map<string, { status: string; total: number }>();
    for (const t of tabsQuery.data ?? []) {
      map.set(t.appointment_id, { status: t.status, total: Number(t.total ?? 0) });
    }
    return map;
  }, [tabsQuery.data]);

  const teamQuery = useQuery({
    queryKey: ["admin", "team", companyId],
    enabled: hasCompany && Boolean(companyId) && Boolean(teamFeatureQuery.data) && !isProvider,
    queryFn: async () => {
      const res = await teamService.list(companyId!);
      if (res.error) throw res.error;
      return res.data;
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

  const dayAppointmentsQuery = useQuery({
    queryKey: ["admin", "agenda", "day", companyId, dateYmd],
    enabled: hasCompany && view === "dia",
    queryFn: async () => {
      const res = await appointmentService.listByCompanyAndDate(companyId!, dateYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const dayBlocksQuery = useQuery({
    queryKey: ["admin", "agenda", "blocks", companyId, dateYmd],
    enabled: hasCompany && view === "dia",
    queryFn: async () => {
      const res = await scheduleBlockService.listByCompanyAndDate(companyId!, dateYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
  });

  const businessSettingsQuery = useQuery({
    queryKey: ["admin", "business_settings", companyId],
    enabled: hasCompany,
    queryFn: async () => {
      const res = await businessSettingsService.getByCompany(companyId!);
      if (res.error) throw res.error;
      return res.data;
    },
    staleTime: 60_000,
  });

  const workingDays = useMemo(
    () =>
      normalizeWorkingDays(
        (businessSettingsQuery.data as { working_days?: unknown } | null)?.working_days ??
          DEFAULT_WORKING_DAYS,
      ),
    [businessSettingsQuery.data],
  );

  const businessHours = useMemo(
    () => ({
      opening_time: normalizeTimeHm(
        (businessSettingsQuery.data as { opening_time?: string } | null)?.opening_time,
        DEFAULT_OPENING_TIME,
      ),
      closing_time: normalizeTimeHm(
        (businessSettingsQuery.data as { closing_time?: string } | null)?.closing_time,
        DEFAULT_CLOSING_TIME,
      ),
    }),
    [businessSettingsQuery.data],
  );

  const hoursSummary = useMemo(
    () => formatPublicHoursText(workingDays, businessHours.opening_time!, businessHours.closing_time!),
    [workingDays, businessHours.opening_time, businessHours.closing_time],
  );

  const dayIsOpen = useMemo(() => isWorkingDate(day, workingDays), [day, workingDays]);

  const subtitle = useMemo(
    () => (hoursSummary ? `${dateLabel} · ${hoursSummary}` : dateLabel),
    [dateLabel, hoursSummary],
  );

  const weekStart = useMemo(() => startOfWeek(day), [day]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartYmd = useMemo(() => toYmd(weekStart), [weekStart]);
  const weekEndYmd = useMemo(() => toYmd(weekEnd), [weekEnd]);

  const weekAppointmentsQuery = useQuery({
    queryKey: ["admin", "agenda", "week", companyId, weekStartYmd, weekEndYmd],
    enabled: hasCompany && view === "semana",
    queryFn: async () => {
      const res = await appointmentService.listByCompanyForRange(companyId!, weekStartYmd, weekEndYmd);
      if (res.error) throw res.error;
      return res.data ?? [];
    },
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const weekTimeSlots = useMemo(() => {
    const base = buildAgendaHourSlots(businessHours.opening_time!, businessHours.closing_time!);
    const times = new Set(base);
    for (const a of weekAppointmentsQuery.data ?? []) {
      const t = formatAppointmentTimeHm(a.appointment_time);
      if (t) times.add(t);
    }
    return Array.from(times).sort();
  }, [weekAppointmentsQuery.data, businessHours.opening_time, businessHours.closing_time]);

  const createAppointmentMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      if (!form.client_id || !form.service_id) throw new Error("Campos obrigatórios");
      const res = await appointmentService.create(companyId, {
        client_id: form.client_id,
        service_id: form.service_id,
        appointment_date: dateYmd,
        appointment_time: form.time,
        provider_id: isProvider ? providerId : providerFilterId || null,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Agendamento criado");
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "day", companyId, dateYmd] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "week", companyId, weekStartYmd, weekEndYmd] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "tabs", companyId, dateYmd] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: { id: string; status: string }) => {
      if (!companyId) throw new Error("Sem empresa");

      const res = await appointmentService.updateStatus(companyId, input.id, input.status);
      if (res.error) {
        throw new Error(formatSupabaseApiError(res.error) || "Não foi possível atualizar o agendamento.");
      }
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "day", companyId, dateYmd] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "week", companyId, weekStartYmd, weekEndYmd] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "tabs", companyId, dateYmd] });
    },
    onError: (err: unknown) => {
      toast.error(mutationErrorMessage(err, "Não foi possível atualizar o agendamento."));
    },
  });

  const invalidateBlocks = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "blocks", companyId, dateYmd] });
  };

  const blocks = useMemo(() => (dayBlocksQuery.data ?? []) as ScheduleBlockRow[], [dayBlocksQuery.data]);

  const activeBlockScopeId = useMemo(() => {
    if (isProvider) return providerId ?? null;
    return providerFilterId || null;
  }, [isProvider, providerId, providerFilterId]);

  const ownerViewingAllProviders = !isProvider && !providerFilterId;

  const agendaBlocks = useMemo(() => {
    if (ownerViewingAllProviders) return blocks;
    return blocksForAgendaScope(blocks, activeBlockScopeId);
  }, [blocks, ownerViewingAllProviders, activeBlockScopeId]);

  const blockScopeHint = useMemo(
    () =>
      blockScopeLabel(
        activeBlockScopeId,
        teamQuery.data?.providers?.find((p: { id: string }) => p.id === activeBlockScopeId)?.display_name,
      ),
    [activeBlockScopeId, teamQuery.data?.providers],
  );

  const toggleBulkBlockMutation = useMutation({
    mutationFn: async (blockType: ScheduleBlockType) => {
      if (!companyId) throw new Error("Sem empresa");
      const scopeId = activeBlockScopeId;
      const blocks = (dayBlocksQuery.data ?? []) as ScheduleBlockRow[];
      if (hasBlockType(blocks, blockType, scopeId)) {
        const res = await scheduleBlockService.deleteByType(companyId, dateYmd, blockType, scopeId);
        if (res.error) throw res.error;
        return { action: "removed" as const, blockType };
      }
      if (blockType === "day_full") {
        await scheduleBlockService.deleteByType(companyId, dateYmd, "morning_full", scopeId);
        await scheduleBlockService.deleteByType(companyId, dateYmd, "afternoon_full", scopeId);
      }
      const res = await scheduleBlockService.create(companyId, {
        block_date: dateYmd,
        block_type: blockType,
        provider_id: scopeId,
      });
      if (res.error) throw res.error;
      return { action: "created" as const, blockType };
    },
    onSuccess: async (result) => {
      const labels: Record<string, string> = {
        morning_full: "manhã",
        afternoon_full: "tarde",
        day_full: "dia inteiro",
      };
      const label = labels[result.blockType] ?? "período";
      toast.success(result.action === "created" ? `Bloqueio da ${label} ativado` : `Bloqueio da ${label} removido`);
      await invalidateBlocks();
    },
    onError: () => {
      toast.error("Não foi possível atualizar o bloqueio. Tente novamente.");
    },
  });

  const toggleHourBlockMutation = useMutation({
    mutationFn: async (hourHm: string) => {
      if (!companyId) throw new Error("Sem empresa");
      const scopeId = activeBlockScopeId;
      const blocks = (dayBlocksQuery.data ?? []) as ScheduleBlockRow[];
      const manual = findManualBlockForHour(blocks, hourHm, scopeId);
      if (manual?.id) {
        const res = await scheduleBlockService.delete(companyId, manual.id);
        if (res.error) throw res.error;
        return { action: "unblocked" as const, hourHm };
      }
      const res = await scheduleBlockService.create(companyId, {
        block_date: dateYmd,
        block_type: "manual_block",
        time_start: hourHm,
        time_end: hourSlotEnd(hourHm),
        provider_id: scopeId,
      });
      if (res.error) throw res.error;
      return { action: "blocked" as const, hourHm };
    },
    onSuccess: async (result) => {
      toast.success(
        result.action === "blocked"
          ? `Horário ${result.hourHm} bloqueado para agendamento online`
          : `Horário ${result.hourHm} liberado`,
      );
      await invalidateBlocks();
    },
    onError: () => {
      toast.error("Não foi possível alterar este horário. Tente novamente.");
    },
  });

  const filteredDayAppointments = useMemo(() => {
    const list = dayAppointmentsQuery.data ?? [];
    if (!providerFilterId) return list;
    return list.filter((a: { provider_id?: string | null }) => a.provider_id === providerFilterId);
  }, [dayAppointmentsQuery.data, providerFilterId]);

  const filteredWeekAppointments = useMemo(() => {
    const list = weekAppointmentsQuery.data ?? [];
    if (!providerFilterId) return list;
    return list.filter((a: { provider_id?: string | null }) => a.provider_id === providerFilterId);
  }, [weekAppointmentsQuery.data, providerFilterId]);

  const dayTimeSlots = useMemo(() => {
    if (!dayIsOpen) {
      // Ainda mostra horários de agendamentos existentes em dia fechado
      const times = new Set<string>();
      for (const a of filteredDayAppointments) {
        const t = formatAppointmentTimeHm(a.appointment_time);
        if (t) times.add(t);
      }
      return Array.from(times).sort();
    }
    const times = new Set(
      buildAgendaHourSlots(businessHours.opening_time!, businessHours.closing_time!),
    );
    for (const a of filteredDayAppointments) {
      const t = formatAppointmentTimeHm(a.appointment_time);
      if (t) times.add(t);
    }
    return Array.from(times).sort();
  }, [filteredDayAppointments, businessHours.opening_time, businessHours.closing_time, dayIsOpen]);

  const dayEventsByTime = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of filteredDayAppointments) {
      const key = formatAppointmentTimeHm(a.appointment_time);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    for (const [, list] of map) {
      list.sort((x, y) => compareAppointmentTime(x.appointment_time, y.appointment_time));
    }
    return map;
  }, [filteredDayAppointments]);

  const isBlockedAt = (time: string) => isHourBlocked(time, agendaBlocks, businessHours);

  const handleHourSlotClick = (hora: string) => {
    const eventos = dayEventsByTime.get(hora) ?? [];
    if (eventos.length > 0) return;

    if (ownerViewingAllProviders) {
      const studioManual = findManualBlockForHour(blocks, hora, null);
      if (studioManual) {
        toggleHourBlockMutation.mutate(hora);
        return;
      }
      const covering = findCoveringBlockForHour(blocks, hora, businessHours);
      if (covering?.provider_id) {
        const name =
          (covering.provider as { display_name?: string | null } | null | undefined)?.display_name ??
          "prestador";
        toast.message(`Horário bloqueado por ${name}. Selecione o prestador no filtro para alterar.`);
        return;
      }
      if (isBlockedAt(hora)) {
        toast.message("Horário bloqueado pelo botão manhã/tarde/dia. Clique de novo no mesmo botão para remover.");
        return;
      }
      toggleHourBlockMutation.mutate(hora);
      return;
    }

    const manual = findManualBlockForHour(blocks, hora, activeBlockScopeId);
    if (manual) {
      toggleHourBlockMutation.mutate(hora);
      return;
    }
    if (isBlockedAt(hora)) {
      toast.message("Horário bloqueado pelo botão manhã/tarde/dia. Clique de novo no mesmo botão para remover.");
      return;
    }
    toggleHourBlockMutation.mutate(hora);
  };

  return (
    <>
    <div>
      <PageTitle
        title={isProvider ? "Minha agenda" : "Agenda"}
        subtitle={
          isProvider
            ? `${subtitle} · seus agendamentos`
            : subtitle
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
        {!isProvider && teamFeatureQuery.data && (teamQuery.data?.providers?.length ?? 0) > 0 ? (
              <select
                className="h-10 rounded-full border border-border bg-card px-3 text-sm"
                value={providerFilterId}
                onChange={(e) => setProviderFilterId(e.target.value)}
              >
                <option value="">Todos os prestadores</option>
                {(teamQuery.data?.providers ?? [])
                  .filter((p: { active: boolean }) => p.active)
                  .map((p: { id: string; display_name: string }) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
              </select>
            ) : null}
            <div className="inline-flex rounded-full border border-border bg-card p-1">
              {(["dia", "semana"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full px-4 py-1.5 text-xs capitalize ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm text-background">
                  <Plus className="size-4" /> Novo
                </button>
              </DialogTrigger>
              <DialogContent className={adminMobileDialogContentClass}>
                <DialogHeader className={adminMobileDialogHeaderClass}>
                  <DialogTitle>Novo agendamento</DialogTitle>
                  <DialogDescription>Crie um agendamento manual para o dia selecionado.</DialogDescription>
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
                      <span className="text-xs font-medium text-muted-foreground">Horário</span>
                      <select
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        value={form.time}
                        onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))}
                      >
                        {buildAgendaHourSlots(businessHours.opening_time!, businessHours.closing_time!).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <DialogFooter className={adminMobileDialogFooterClass}>
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={createAppointmentMutation.isPending}>
                    Cancelar
                  </Button>
                  <Button onClick={() => createAppointmentMutation.mutate()} disabled={createAppointmentMutation.isPending}>
                    {createAppointmentMutation.isPending ? "Salvando…" : "Salvar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[auto_1fr] lg:items-start">
        <div className="w-fit rounded-2xl border border-border bg-card p-2 shadow-soft">
          <CalendarPicker
            mode="single"
            selected={day}
            onSelect={(d) => d && setDay(d)}
            locale={ptBR}
            className="rounded-xl"
            modifiers={{ closed: (d) => !isWorkingDate(d, workingDays) }}
            modifiersClassNames={{ closed: "opacity-40" }}
          />
          <p className="mt-2 px-2 pb-1 text-[11px] text-muted-foreground">
            Dias mais claros estão fechados conforme o horário da marca.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <p className="w-full text-[11px] text-muted-foreground">
            Bloqueios para: <span className="font-medium text-foreground">{blockScopeHint}</span>
            {dayIsOpen ? null : (
              <span className="mt-1 block text-warning">
                Este dia está marcado como fechado. Ajuste os dias em Aparência da marca ou Configurações.
              </span>
            )}
          </p>
          {(
            [
              { type: "morning_full" as const, label: "Bloquear manhã" },
              { type: "afternoon_full" as const, label: "Bloquear tarde" },
              { type: "day_full" as const, label: "Marcar dia lotado" },
            ] as const
          ).map(({ type, label }) => {
            const active = hasBlockType(blocks, type, activeBlockScopeId);
            return (
              <button
                key={type}
                type="button"
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 transition ${
                  active ? "bg-foreground text-background" : "bg-secondary hover:bg-accent"
                }`}
                onClick={() => toggleBulkBlockMutation.mutate(type)}
                disabled={toggleBulkBlockMutation.isPending || !dayIsOpen}
              >
                <Lock className="size-3" />
                {active ? `${label} (ativo)` : label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "dia" ? (
        <div className="rounded-2xl border border-border bg-card p-2 shadow-soft">
          {dayAppointmentsQuery.isError ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">Não foi possível carregar os agendamentos deste dia.</p>
          ) : dayAppointmentsQuery.isLoading || dayBlocksQuery.isLoading ? (
            Array.from({ length: 11 }).map((_, i) => <AdminAgendaDaySlotSkeleton key={`day-sk-${i}`} />)
          ) : dayTimeSlots.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {dayIsOpen
                ? "Nenhum horário para exibir."
                : "Salão fechado neste dia. Escolha outro dia no calendário ou ajuste o horário em Aparência da marca."}
            </p>
          ) : (
            dayTimeSlots.map((hora) => {
              const eventos = dayEventsByTime.get(hora) ?? [];
              const occupied = eventos.length > 0;
              const blocked = !occupied && isBlockedAt(hora);
              const manualBlock = ownerViewingAllProviders
                ? findManualBlockForHour(blocks, hora, null)
                : findManualBlockForHour(blocks, hora, activeBlockScopeId);
              const coveringBlock = blocked ? findCoveringBlockForHour(agendaBlocks, hora, businessHours) : null;
              const providerBlockName =
                (coveringBlock?.provider as { display_name?: string | null } | null | undefined)?.display_name ??
                null;
              const slotLabel = occupied ? "Ocupado" : blocked ? "Bloqueado" : "Horário livre";
              return (
                <div key={hora} className="flex gap-4 border-b border-border last:border-0 px-3 py-3">
                  <div className="w-14 pt-1 text-xs text-muted-foreground">{hora}</div>
                  <div className="flex-1 space-y-2">
                    {occupied ? (
                      eventos.map((evento) => (
                        <div key={evento.id} className="rounded-xl bg-secondary/60 p-3">
                          <div className="flex gap-3">
                            <ProviderAgendaAvatar provider={evento.provider} showName />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium">{evento.client?.name ?? "Cliente"}</div>
                                  {providerAgendaLabel(evento.provider) ? (
                                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <span
                                        className="size-2 shrink-0 rounded-full"
                                        style={{
                                          backgroundColor: evento.provider?.color?.trim() || "#1a1a1a",
                                        }}
                                        aria-hidden
                                      />
                                      <span className="truncate">{providerAgendaLabel(evento.provider)}</span>
                                    </div>
                                  ) : null}
                                </div>
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${statusClass[evento.status] ?? statusClass.scheduled}`}
                                >
                                  {statusLabel[evento.status] ?? "Agendado"}
                                </span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{evento.service?.name ?? "Serviço"}</div>
                              {(evento as { client_package_id?: string | null }).client_package_id ? (
                                <div className="mt-1">
                                  {(() => {
                                    const pkgId = (evento as { client_package_id?: string | null }).client_package_id!;
                                    const pkg = packageById.get(pkgId);
                                    const sessionNum = (evento as { package_session_number?: number | null })
                                      .package_session_number;
                                    if (pkg?.status === "pending_payment") {
                                      return (
                                        <span className="inline-flex rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium text-warning">
                                          Pacote · confirme pagamento na comanda
                                        </span>
                                      );
                                    }
                                    if (pkg?.status === "active") {
                                      return (
                                        <span className="inline-flex rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
                                          Pacote ativo · {pkg.used_sessions}/{pkg.total_sessions} sessões
                                          {sessionNum ? ` · sessão ${sessionNum}` : ""}
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                        Pacote
                                      </span>
                                    );
                                  })()}
                                </div>
                              ) : null}
                              <div className="mt-0.5 text-xs text-muted-foreground">{clientContactLine(evento.client)}</div>
                              {(() => {
                                const tabInfo = tabByAppointmentId.get(evento.id);
                                if (!tabInfo || evento.status === "cancelled" || evento.status === "no_show") {
                                  return null;
                                }
                                if (tabInfo.status === "closed" || evento.status === "completed") {
                                  return (
                                    <div className="mt-1 text-[10px] text-success">
                                      Comanda fechada
                                      {tabInfo.total > 0 ? ` · ${formatTabMoney(tabInfo.total)}` : ""}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="mt-1 text-[10px] text-info">
                                    Comanda aberta · {formatTabMoney(tabInfo.total)}
                                    {isOwnerAdmin ? " · aguardando caixa" : ""}
                                  </div>
                                );
                              })()}
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                                <button
                                  type="button"
                                  className="rounded-full border border-gold/40 bg-gold-soft/30 px-2.5 py-1 font-medium hover:bg-gold-soft/50"
                                  onClick={() => setComandaAppointmentId(evento.id)}
                                >
                                  Comanda
                                </button>
                                {isOwnerAdmin && tabByAppointmentId.get(evento.id)?.status === "open" ? (
                                  <Link
                                    to="/admin/comandas"
                                    className="rounded-full border border-border bg-background px-2.5 py-1 hover:bg-accent"
                                  >
                                    Caixa
                                  </Link>
                                ) : null}
                                <button type="button" className="rounded-full border border-border bg-background px-2.5 py-1 hover:bg-accent" disabled>
                                  Reagendar
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-border bg-background px-2.5 py-1 hover:bg-accent"
                                  onClick={() => updateStatusMutation.mutate({ id: evento.id, status: "cancelled" })}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-border bg-background px-2.5 py-1 hover:bg-accent"
                                  onClick={() => updateStatusMutation.mutate({ id: evento.id, status: "no_show" })}
                                >
                                  Não compareceu
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleHourSlotClick(hora)}
                        disabled={toggleHourBlockMutation.isPending}
                        className={`w-full rounded-xl border px-3 py-3 text-left text-xs transition ${
                          blocked
                            ? "border-warning/50 bg-warning/10 text-warning"
                            : "border-dashed border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:bg-secondary/40"
                        }`}
                      >
                        <span className="font-medium">{slotLabel}</span>
                        <span className="mt-0.5 block text-[10px] opacity-80">
                          {blocked
                            ? manualBlock
                              ? "Clique para liberar"
                              : providerBlockName
                                ? `Bloqueado por ${providerBlockName}${ownerViewingAllProviders ? " — selecione no filtro para alterar" : ""}`
                                : "Bloqueio em massa — use os botões acima para remover"
                            : "Clique para bloquear este horário"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="-mx-1 overflow-x-auto rounded-2xl border border-border bg-card px-1 shadow-soft sm:mx-0 sm:px-0">
          {weekAppointmentsQuery.isLoading ? (
            <AdminAgendaWeekGridSkeleton />
          ) : (
            <div className="min-w-[700px] grid grid-cols-8 text-xs">
              <div />
              {Array.from({ length: 7 }).map((_, idx) => {
                const d = addDays(weekStart, idx);
                const label = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
                const openDay = isWorkingDate(d, workingDays);
                return (
                  <div
                    key={idx}
                    className={`border-b border-l border-border p-3 text-center font-medium ${
                      openDay ? "" : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {label}
                    {!openDay ? <div className="mt-0.5 text-[10px] font-normal">Fechado</div> : null}
                  </div>
                );
              })}
              {weekTimeSlots.map((h) => (
                <FragmentRow
                  key={h}
                  h={h}
                  weekStart={weekStart}
                  weekAppointments={filteredWeekAppointments}
                  workingDays={workingDays}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    <ComandaDrawer
      appointmentId={comandaAppointmentId}
      open={Boolean(comandaAppointmentId)}
      onOpenChange={(open) => !open && setComandaAppointmentId(null)}
      onClosed={() => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "tabs", companyId, dateYmd] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "day", companyId, dateYmd] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "cash-register", companyId] });
      }}
      cashOpen={Boolean(cashQuery.data)}
    />
    </>
  );
}

function FragmentRow({
  h,
  weekStart,
  weekAppointments,
  workingDays,
}: {
  h: string;
  weekStart: Date;
  weekAppointments: any[];
  workingDays: boolean[];
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, any>();
    for (const a of weekAppointments) {
      const time = formatAppointmentTimeHm(a.appointment_time);
      if (time !== h) continue;
      map.set(formatAppointmentDateYmd(a.appointment_date), a);
    }
    return map;
  }, [weekAppointments, h]);

  return (
    <>
      <div className="border-b border-border p-3 text-muted-foreground">{h}</div>
      {Array.from({ length: 7 }).map((_, c) => {
        const d = addDays(weekStart, c);
        const key = toYmd(d);
        const appt = byDay.get(key);
        const openDay = isWorkingDate(d, workingDays);
        return (
          <div
            key={c}
            className={`border-b border-l border-border p-2 ${openDay ? "" : "bg-muted/30"}`}
          >
            {appt && (
              <div className="rounded-md border border-border bg-secondary/70 p-1">
                <div className="flex items-center gap-1">
                  <ProviderAgendaAvatar provider={appt.provider} size="sm" />
                  <span className="min-w-0 truncate text-[10px] text-foreground">{appt.client?.name ?? "Cliente"}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
