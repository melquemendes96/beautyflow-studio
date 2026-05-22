import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/AdminShell";
import { Lock, Plus } from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { ptBR } from "date-fns/locale";
import { useCurrentCompany } from "@/lib/current-company";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appointmentService } from "@/services/appointmentService";
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
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminAgendaDaySlotSkeleton, AdminAgendaWeekGridSkeleton } from "@/components/admin/AdminPageStates";
import {
  clientContactLine,
  compareAppointmentTime,
  formatAppointmentDateYmd,
  formatAppointmentTimeHm,
} from "@/lib/appointment-time";

export const Route = createFileRoute("/admin/agenda")({
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

function Agenda() {
  const [view, setView] = useState<"dia" | "semana">("dia");
  const queryClient = useQueryClient();
  const { companyId, hasCompany } = useCurrentCompany();
  const [day, setDay] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    client_id: "",
    service_id: "",
    time: "09:00",
  });

  const dateYmd = useMemo(() => toYmd(day), [day]);
  const subtitle = useMemo(
    () =>
      day.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }),
    [day],
  );

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
    const base = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];
    const times = new Set(base);
    for (const a of weekAppointmentsQuery.data ?? []) {
      const t = formatAppointmentTimeHm(a.appointment_time);
      if (t) times.add(t);
    }
    return Array.from(times).sort();
  }, [weekAppointmentsQuery.data]);

  const createAppointmentMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Sem empresa");
      if (!form.client_id || !form.service_id) throw new Error("Campos obrigatórios");
      const res = await appointmentService.create(companyId, {
        client_id: form.client_id,
        service_id: form.service_id,
        appointment_date: dateYmd,
        appointment_time: form.time,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      setOpen(false);
      toast.success("Agendamento criado");
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "day", companyId, dateYmd] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "week", companyId, weekStartYmd, weekEndYmd] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: { id: string; status: string }) => {
      if (!companyId) throw new Error("Sem empresa");
      const res = await appointmentService.updateStatus(companyId, input.id, input.status);
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "day", companyId, dateYmd] });
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "week", companyId, weekStartYmd, weekEndYmd] });
    },
  });

  const createBlockMutation = useMutation({
    mutationFn: async (blockType: "morning_full" | "afternoon_full" | "day_full") => {
      if (!companyId) throw new Error("Sem empresa");
      const ranges =
        blockType === "morning_full"
          ? { time_start: "08:00", time_end: "12:00" }
          : blockType === "afternoon_full"
            ? { time_start: "12:00", time_end: "18:00" }
            : { time_start: "08:00", time_end: "18:00" };
      const res = await scheduleBlockService.create(companyId, {
        block_date: dateYmd,
        time_start: ranges.time_start,
        time_end: ranges.time_end,
        block_type: blockType,
      });
      if (res.error) throw res.error;
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Bloqueio aplicado");
      await queryClient.invalidateQueries({ queryKey: ["admin", "agenda", "blocks", companyId, dateYmd] });
    },
  });

  const dayTimeSlots = useMemo(() => {
    const times = new Set<string>();
    for (let h = 8; h <= 18; h++) times.add(`${String(h).padStart(2, "0")}:00`);
    for (const a of dayAppointmentsQuery.data ?? []) {
      const t = formatAppointmentTimeHm(a.appointment_time);
      if (t) times.add(t);
    }
    return Array.from(times).sort();
  }, [dayAppointmentsQuery.data]);

  const dayEventsByTime = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of dayAppointmentsQuery.data ?? []) {
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
  }, [dayAppointmentsQuery.data]);

  const blocks = useMemo(() => dayBlocksQuery.data ?? [], [dayBlocksQuery.data]);
  const isBlockedAt = (time: string) => {
    return blocks.some((b: any) => {
      const start = String(b.time_start ?? "").slice(0, 5);
      const end = String(b.time_end ?? "").slice(0, 5);
      return time >= start && time < end;
    });
  };

  return (
    <div>
      <PageTitle
        title="Agenda"
        subtitle={subtitle}
        action={
          <div className="flex gap-2">
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
              <DialogContent className="rounded-3xl">
                <DialogHeader>
                  <DialogTitle>Novo agendamento</DialogTitle>
                  <DialogDescription>Crie um agendamento manual para o dia selecionado.</DialogDescription>
                </DialogHeader>

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
                    <Input value={form.time} onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))} />
                  </label>
                </div>

                <DialogFooter>
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
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 hover:bg-accent"
            onClick={() => createBlockMutation.mutate("morning_full")}
            disabled={createBlockMutation.isPending}
          >
            <Lock className="size-3" /> Bloquear manhã
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 hover:bg-accent"
            onClick={() => createBlockMutation.mutate("afternoon_full")}
            disabled={createBlockMutation.isPending}
          >
            <Lock className="size-3" /> Bloquear tarde
          </button>
          <button
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 hover:bg-accent"
            onClick={() => createBlockMutation.mutate("day_full")}
            disabled={createBlockMutation.isPending}
          >
            <Lock className="size-3" /> Marcar dia lotado
          </button>
        </div>
      </div>

      {view === "dia" ? (
        <div className="rounded-2xl border border-border bg-card p-2 shadow-soft">
          {dayAppointmentsQuery.isError ? (
            <p className="px-3 py-6 text-center text-sm text-destructive">Não foi possível carregar os agendamentos deste dia.</p>
          ) : dayAppointmentsQuery.isLoading || dayBlocksQuery.isLoading ? (
            Array.from({ length: 11 }).map((_, i) => <AdminAgendaDaySlotSkeleton key={`day-sk-${i}`} />)
          ) : dayTimeSlots.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum horário para exibir.</p>
          ) : (
            dayTimeSlots.map((hora) => {
              const eventos = dayEventsByTime.get(hora) ?? [];
              const blocked = isBlockedAt(hora);
              return (
                <div key={hora} className="flex gap-4 border-b border-border last:border-0 px-3 py-3">
                  <div className="w-14 pt-1 text-xs text-muted-foreground">{hora}</div>
                  <div className="flex-1 space-y-2">
                    {eventos.length > 0 ? (
                      eventos.map((evento) => (
                        <div key={evento.id} className="rounded-xl bg-secondary/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">{evento.client?.name ?? "Cliente"}</div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${statusClass[evento.status] ?? statusClass.scheduled}`}
                            >
                              {statusLabel[evento.status] ?? "Agendado"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">{evento.service?.name ?? "Serviço"}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{clientContactLine(evento.client)}</div>
                          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                            <button
                              type="button"
                              className="rounded-full border border-border bg-background px-2.5 py-1 hover:bg-accent"
                              onClick={() => updateStatusMutation.mutate({ id: evento.id, status: "completed" })}
                            >
                              Concluir
                            </button>
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
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
                        {blocked ? "Bloqueado" : "Horário livre"}
                      </div>
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
                return (
                  <div key={idx} className="border-b border-l border-border p-3 text-center font-medium">
                    {label}
                  </div>
                );
              })}
              {weekTimeSlots.map((h) => (
                <FragmentRow key={h} h={h} weekStart={weekStart} weekAppointments={weekAppointmentsQuery.data ?? []} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  h,
  weekStart,
  weekAppointments,
}: {
  h: string;
  weekStart: Date;
  weekAppointments: any[];
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
        return (
          <div key={c} className="border-b border-l border-border p-2">
            {appt && (
              <div className="rounded-md bg-foreground/90 px-2 py-1 text-[10px] text-background">
                {appt.client?.name ?? "Cliente"}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
