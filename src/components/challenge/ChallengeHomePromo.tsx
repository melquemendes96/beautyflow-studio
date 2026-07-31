import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { ChallengeCountdownDisplay } from "@/components/challenge/ChallengeCountdownDisplay";
import {
  CHALLENGE_HEADLINE,
  CHALLENGE_PATH,
  CHALLENGE_SUBHEAD,
  dismissChallengeBanner,
  getChallengeCountdown,
  isChallengeBannerDismissed,
} from "@/lib/challenge-60";
import { trackMarketingEvent } from "@/lib/marketing-analytics";

/**
 * Modal 1ª visita + barra sticky — home.
 * Quem fecha o modal não vê de novo por 7 dias.
 */
export function ChallengeHomePromo({ forceOpen = false }: { forceOpen?: boolean }) {
  const navigate = useNavigate();
  const ended = getChallengeCountdown().ended;
  const [modalOpen, setModalOpen] = useState(false);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    if (ended) return;
    if (forceOpen) {
      setModalOpen(true);
      setShowBar(true);
      trackMarketingEvent("challenge_banner_view", { oncePerSession: true, placement: "forced" });
      return;
    }
    if (isChallengeBannerDismissed()) {
      setShowBar(true);
      return;
    }
    setModalOpen(true);
    setShowBar(true);
    trackMarketingEvent("challenge_banner_view", { oncePerSession: true, placement: "modal" });
  }, [ended, forceOpen]);

  if (ended) return null;

  const goDesafio = () => {
    setModalOpen(false);
    void navigate({ to: CHALLENGE_PATH, search: { desafio: "60" } });
  };

  const dismissModal = () => {
    dismissChallengeBanner(7);
    setModalOpen(false);
    trackMarketingEvent("challenge_banner_dismiss", { oncePerSession: true });
  };

  return (
    <>
      {showBar ? (
        <div className="relative z-50 border-b border-gold/30 bg-foreground text-background">
          <div className="container-page flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <p className="min-w-0 flex-1 font-medium">
              <Sparkles className="mr-1.5 inline size-3.5 text-gold" aria-hidden />
              Desafio 60 dias grátis —{" "}
              <ChallengeCountdownDisplay compact className="inline tabular-nums text-gold" />
            </p>
            <Link
              to={CHALLENGE_PATH}
              search={{ desafio: "60" }}
              className="shrink-0 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-foreground hover:opacity-90"
            >
              Quero participar
            </Link>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/45 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="challenge-modal-title"
        >
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-elegant sm:p-8">
            <button
              type="button"
              aria-label="Fechar"
              onClick={dismissModal}
              className="absolute right-3 top-3 rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="size-4" />
            </button>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-medium uppercase tracking-widest text-gold">
              <Sparkles className="size-3" /> Desafio 60 dias
            </span>
            <h2 id="challenge-modal-title" className="mt-4 font-display text-2xl leading-snug">
              {CHALLENGE_HEADLINE}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{CHALLENGE_SUBHEAD}</p>
            <div className="mt-5">
              <p className="mb-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
                Termina em
              </p>
              <ChallengeCountdownDisplay />
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={goDesafio}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background hover:opacity-90"
              >
                Quero 60 dias grátis
              </button>
              <button
                type="button"
                onClick={dismissModal}
                className="inline-flex min-h-10 items-center justify-center rounded-full px-5 text-sm text-muted-foreground hover:text-foreground"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
