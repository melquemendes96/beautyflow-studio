import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";
import { Calendar, Star, ArrowRight, LogOut } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clientPortalService } from "@/services/clientPortalService";
import { toast } from "sonner";
import { publicBookingService } from "@/services/publicBookingService";
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
import { Skeleton } from "@/components/ui/skeleton";
import { AdminEmptyState } from "@/components/admin/AdminPageStates";

export const Route = createFileRoute("/cliente")({
  component: Cliente,
});

const statusLabel: Record<string, string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

const statusClass: Record<string, string> = {
  scheduled: "bg-info/15 text-info",
  confirmed: "bg-purple-soft/15 text-purple-soft",
  completed: "bg-success/15 text-success",
  cancelled: "bg-warning/20 text-warning",
  no_show: "bg-destructive/15 text-destructive",
};

function ClienteNextAppointmentSkeleton() {
  return (
    <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-soft">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-9 w-3/4 max-w-xs" />
      <Skeleton className="mt-2 h-4 w-48" />
      <Skeleton className="mt-4 h-4 w-32" />
      <div className="mt-5 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-28 rounded-full" />
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
    </div>
  );
}

function ClienteHistoryRowSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-48 max-w-full" />
          <Skeleton className="h-3 w-36 max-w-full" />
        </div>
        <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-9 w-28 rounded-full" />
    </div>
  );
}

function Cliente() {
  const queryClient = useQueryClient();
  const [auth, setAuth] = useState({ slug: "joyce-mendes", email: "", whatsapp: "" });
  const [isAuthed, setIsAuthed] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reschedule, setReschedule] = useState({ date: "", time: "" });

  const portalQuery = useQuery({
    queryKey: ["client_portal", auth.slug, auth.email, auth.whatsapp],
    enabled: isAuthed,
    queryFn: async () => {
      const res = await clientPortalService.getPortalData(auth);
      if (res.error) throw res.error;
      return res.data as Record<string, unknown>;
    },
  });

  const upcoming = (portalQuery.data?.upcoming ?? []) as Record<string, unknown>[];
  const history = (portalQuery.data?.history ?? []) as Record<string, unknown>[];

  const proximo = useMemo(() => (upcoming[0] ?? null) as Record<string, unknown> | null, [upcoming]);

  const serviceIdForReschedule = (proximo?.service_id ?? null) as string | null;

  const slotsQuery = useQuery({
    queryKey: ["client_portal", "slots", auth.slug, serviceIdForReschedule, reschedule.date],
    enabled: Boolean(isAuthed && serviceIdForReschedule && reschedule.date),
    queryFn: async () => {
      const res = await publicBookingService.getAvailableSlots({
        slug: auth.slug,
        serviceId: serviceIdForReschedule!,
        date: reschedule.date,
      });
      if (res.error) throw res.error;
      return (res.data ?? []) as string[];
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await clientPortalService.cancelAppointment({
        slug: auth.slug,
        email: auth.email,
        whatsapp: auth.whatsapp,
        appointmentId,
      });
      if (res.error) throw res.error;
      return res.data as Record<string, unknown>;
    },
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      void portalQuery.refetch();
    },
    onError: () => {
      toast.error("Não foi possível cancelar. Verifique seus dados.");
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      if (!proximo?.id) throw new Error("Sem agendamento");
      const res = await clientPortalService.rescheduleAppointment({
        slug: auth.slug,
        email: auth.email,
        whatsapp: auth.whatsapp,
        appointmentId: String(proximo.id),
        newDate: reschedule.date,
        newTime: reschedule.time,
      });
      if (res.error) throw res.error;
      return res.data as Record<string, unknown>;
    },
    onSuccess: (d) => {
      if (d?.ok === false) {
        if (d?.error === "horario_indisponivel") {
          toast.error("Esse horário acabou de ficar indisponível. Escolha outro.");
          return;
        }
        if (d?.error === "prazo_minimo") {
          toast.error("Esse horário não respeita o prazo mínimo de agendamento.");
          return;
        }
        toast.error("Não foi possível reagendar. Verifique os dados.");
        return;
      }
      toast.success("Agendamento reagendado");
      setRescheduleOpen(false);
      setReschedule({ date: "", time: "" });
      void portalQuery.refetch();
    },
    onError: () => {
      toast.error("Não foi possível reagendar. Tente novamente.");
    },
  });

  const [ratingOpenId, setRatingOpenId] = useState<string | null>(null);
  const [ratingValue, setRatingValue] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>("");

  const ratingMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const res = await clientPortalService.submitRating({
        slug: auth.slug,
        email: auth.email,
        whatsapp: auth.whatsapp,
        appointmentId,
        rating: ratingValue,
        comment: ratingComment,
      });
      if (res.error) throw res.error;
      return res.data as Record<string, unknown>;
    },
    onSuccess: (d) => {
      if (d?.ok === false) {
        if (d?.error === "ja_avaliado") {
          toast.error("Esse atendimento já foi avaliado.");
          return;
        }
        toast.error("Não foi possível enviar sua avaliação.");
        return;
      }
      toast.success("Avaliação enviada. Obrigado!");
      setRatingOpenId(null);
      setRatingValue(5);
      setRatingComment("");
      void portalQuery.refetch();
    },
    onError: () => {
      toast.error("Não foi possível enviar sua avaliação.");
    },
  });

  const portalLoading = isAuthed && portalQuery.isLoading;
  const portalError = isAuthed && portalQuery.isError;
  const portalReady = isAuthed && !portalQuery.isLoading && !portalQuery.isError;

  const onAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAccessError(null);
    if (!auth.slug.trim()) {
      setAccessError("Informe o slug do studio (link público).");
      return;
    }
    if (!auth.email.trim() && !auth.whatsapp.trim()) {
      setAccessError("Informe pelo menos e-mail ou WhatsApp usados no agendamento.");
      return;
    }
    setAuth((s) => ({
      ...s,
      slug: s.slug.trim(),
      email: s.email.trim(),
      whatsapp: s.whatsapp.trim(),
    }));
    setIsAuthed(true);
  };

  const signOutPortal = () => {
    setIsAuthed(false);
    setAccessError(null);
    queryClient.removeQueries({ queryKey: ["client_portal"] });
  };

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-3">
          <Link to="/">
            <Logo className="h-9" />
          </Link>
          <div className="flex items-center gap-2">
            {isAuthed ? (
              <button
                type="button"
                onClick={() => signOutPortal()}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground sm:text-sm"
              >
                <LogOut className="size-3.5" aria-hidden />
                Sair
              </button>
            ) : null}
            <div
              className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold to-rose text-sm font-medium text-background"
              aria-hidden
            >
              M
            </div>
          </div>
        </div>
      </header>

      <main className="container-page max-w-2xl py-8">
        <h1 className="font-display text-3xl">Meus atendimentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe seus agendamentos e histórico de serviços.</p>

        {!isAuthed && (
          <form
            onSubmit={(e) => void onAccessSubmit(e)}
            className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft"
            noValidate
          >
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Acesso</div>
            <p className="mt-2 text-sm text-muted-foreground">Informe os mesmos dados usados no agendamento.</p>
            {accessError ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {accessError}
              </p>
            ) : null}
            <div className="mt-5 grid gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Seu studio (slug)</span>
                <input
                  value={auth.slug}
                  onChange={(e) => setAuth((s) => ({ ...s, slug: e.target.value }))}
                  autoComplete="off"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">E-mail</span>
                <input
                  type="email"
                  value={auth.email}
                  onChange={(e) => setAuth((s) => ({ ...s, email: e.target.value }))}
                  autoComplete="email"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">WhatsApp</span>
                <input
                  value={auth.whatsapp}
                  onChange={(e) => setAuth((s) => ({ ...s, whatsapp: e.target.value }))}
                  placeholder="(11) 99999-0000"
                  autoComplete="tel"
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:border-foreground focus:ring-2 focus:ring-gold/30"
                />
              </label>
            </div>
            <button
              type="submit"
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-sm text-background disabled:opacity-30"
              disabled={!auth.slug.trim() || (!auth.email.trim() && !auth.whatsapp.trim())}
            >
              Ver meus atendimentos <ArrowRight className="size-4" aria-hidden />
            </button>
          </form>
        )}

        {portalError && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            Não foi possível carregar seus agendamentos. Verifique o slug e os dados ou tente de novo.
            <button
              type="button"
              className="mt-3 block w-full rounded-full border border-destructive/40 bg-background px-4 py-2 text-center text-xs font-medium text-destructive hover:bg-destructive/5 sm:w-auto"
              onClick={() => void portalQuery.refetch()}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {portalLoading && (
          <>
            <ClienteNextAppointmentSkeleton />
            <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Histórico
            </h2>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <ClienteHistoryRowSkeleton key={i} />
              ))}
            </div>
          </>
        )}

        {portalReady && proximo && (
          <div className="mt-6 overflow-hidden rounded-3xl bg-foreground p-6 text-background shadow-elegant">
            <div className="text-xs uppercase tracking-widest text-gold">Próximo atendimento</div>
            <div className="mt-2 font-display text-2xl">{String(proximo.service ?? "")}</div>
            <div className="mt-1 text-background/70">
              {new Date(`${proximo.date as string}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
              {String(proximo.time ?? "")}
            </div>
            <div className="mt-1 text-sm text-background/60">
              {String((portalQuery.data as { company?: { name?: string } })?.company?.name ?? "")}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full bg-gold px-5 py-2.5 text-sm text-foreground hover:opacity-90"
                  >
                    Reagendar
                  </button>
                </DialogTrigger>
                <DialogContent className="rounded-3xl">
                  <DialogHeader>
                    <DialogTitle>Reagendar</DialogTitle>
                    <DialogDescription>Escolha uma nova data e horário.</DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-3">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-medium text-muted-foreground">Data (YYYY-MM-DD)</span>
                      <Input
                        value={reschedule.date}
                        onChange={(e) => setReschedule((s) => ({ ...s, date: e.target.value, time: "" }))}
                        placeholder="Ex.: 2026-05-10"
                      />
                    </label>

                    <div className="grid gap-2">
                      <div className="text-xs font-medium text-muted-foreground">Horários disponíveis</div>
                      {slotsQuery.isLoading ? (
                        <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-12 rounded-xl" />
                          ))}
                        </div>
                      ) : (
                        <div className="-mx-1 max-h-48 overflow-y-auto px-1">
                          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                            {(slotsQuery.data ?? []).map((t) => {
                              const sel = reschedule.time === t;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setReschedule((s) => ({ ...s, time: t }))}
                                  className={`rounded-xl border px-3 py-3 text-sm transition ${
                                    sel
                                      ? "border-foreground bg-foreground text-background"
                                      : "border-border bg-success/10 hover:border-foreground/40"
                                  }`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {!slotsQuery.isLoading && reschedule.date && (slotsQuery.data ?? []).length === 0 && (
                        <div className="rounded-2xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
                          Sem horários disponíveis para essa data.
                        </div>
                      )}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setRescheduleOpen(false)}
                      disabled={rescheduleMutation.isPending}
                    >
                      Fechar
                    </Button>
                    <Button
                      type="button"
                      onClick={() => rescheduleMutation.mutate()}
                      disabled={!reschedule.date || !reschedule.time || rescheduleMutation.isPending}
                    >
                      {rescheduleMutation.isPending ? "Reagendando…" : "Confirmar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <button
                type="button"
                onClick={() => cancelMutation.mutate(String(proximo.id))}
                className="rounded-full border border-background/20 px-5 py-2.5 text-sm hover:bg-background/10"
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? "Cancelando…" : "Cancelar agendamento"}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-background/20 px-5 py-2.5 text-sm opacity-70 hover:bg-background/10"
                disabled
                title="Em breve"
              >
                <Calendar className="size-4" aria-hidden /> Calendário
              </button>
            </div>
          </div>
        )}

        {portalReady && !proximo && (
          <div className="mt-6 rounded-3xl border border-dashed border-border bg-card p-6 text-center shadow-soft">
            <Calendar className="mx-auto size-10 text-muted-foreground" aria-hidden />
            <p className="mt-3 text-sm font-medium text-foreground">Nenhum próximo atendimento</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Faça um novo agendamento pelo link público do seu studio.
            </p>
            <Link
              to="/agendar/$slug"
              params={{ slug: auth.slug }}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm text-background"
            >
              Agendar agora <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        )}

        {portalReady && (
          <>
            <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Histórico
            </h2>
            <div className="space-y-3">
              {history.map((a) => (
                <div key={String(a.id)} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{String(a.service ?? "")}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(`${a.date as string}T00:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                        {String(a.time ?? "")}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs ${statusClass[String(a.status)] ?? statusClass.scheduled}`}
                    >
                      {statusLabel[String(a.status)] ?? String(a.status)}
                    </span>
                  </div>
                  {Number(a.rating ?? 0) > 0 ? (
                    <div className="mt-3 flex gap-1 text-gold">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`size-4 ${i < Number(a.rating) ? "fill-current" : "text-muted-foreground/40"}`}
                          aria-hidden
                        />
                      ))}
                    </div>
                  ) : a.status === "completed" ? (
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-muted-foreground">Como foi seu atendimento?</div>
                      <Dialog open={ratingOpenId === String(a.id)} onOpenChange={(o) => setRatingOpenId(o ? String(a.id) : null)}>
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" className="rounded-full shrink-0">
                            Avaliar
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="rounded-3xl">
                          <DialogHeader>
                            <DialogTitle>Avaliar atendimento</DialogTitle>
                            <DialogDescription>Sua avaliação ajuda o studio a melhorar.</DialogDescription>
                          </DialogHeader>

                          <div className="grid gap-4">
                            <div className="flex gap-2 text-gold">
                              {[1, 2, 3, 4, 5].map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setRatingValue(v)}
                                  className="rounded-md p-1"
                                  aria-label={`${v} estrelas`}
                                >
                                  <Star className={`size-6 ${v <= ratingValue ? "fill-current" : "text-muted-foreground/40"}`} />
                                </button>
                              ))}
                            </div>
                            <label className="grid gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">Comentário (opcional)</span>
                              <Input value={ratingComment} onChange={(e) => setRatingComment(e.target.value)} />
                            </label>
                          </div>

                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setRatingOpenId(null)}
                              disabled={ratingMutation.isPending}
                            >
                              Cancelar
                            </Button>
                            <Button type="button" onClick={() => ratingMutation.mutate(String(a.id))} disabled={ratingMutation.isPending}>
                              {ratingMutation.isPending ? "Enviando…" : "Enviar avaliação"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ) : null}
                </div>
              ))}
              {history.length === 0 && (
                <AdminEmptyState
                  icon={Calendar}
                  title="Nenhum atendimento encontrado"
                  description="Não há histórico com e-mail ou WhatsApp informados. Confira o slug do studio e os dados usados na reserva."
                  action={
                    <Link
                      to="/agendar/$slug"
                      params={{ slug: auth.slug }}
                      className="inline-flex rounded-full bg-foreground px-5 py-2.5 text-sm text-background"
                    >
                      Novo agendamento
                    </Link>
                  }
                />
              )}
            </div>
          </>
        )}

        {isAuthed && !portalLoading ? (
          <Link
            to="/agendar/$slug"
            params={{ slug: auth.slug }}
            className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 py-3.5 text-sm text-background"
          >
            Novo agendamento <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </main>
    </div>
  );
}
