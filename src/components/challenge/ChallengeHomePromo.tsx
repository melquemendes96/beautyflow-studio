import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Sparkles, X } from "lucide-react";
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
 * Modal 1ª visita + barra topo — home.
 * Quem fecha o modal não vê de novo por 7 dias.
 */
export function ChallengeHomePromo({ forceOpen = false }: { forceOpen?: boolean }) {
  const navigate = useNavigate();
  const ended = getChallengeCountdown().ended;
  const [modalOpen, setModalOpen] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const [entered, setEntered] = useState(false);

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

  useEffect(() => {
    if (!modalOpen) {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [modalOpen]);

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
        <div className="challenge-topbar relative z-50 overflow-hidden border-b border-white/10">
          <div className="challenge-topbar__shine pointer-events-none absolute inset-0" aria-hidden />
          <div className="container-page relative flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm text-[#f7f1e6]">
            <p className="min-w-0 flex-1 font-medium tracking-wide">
              <span className="mr-2 inline-flex items-center gap-1 rounded-full border border-[#c9a961]/45 bg-[#c9a961]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e8d5a3]">
                <Sparkles className="size-3" aria-hidden />
                Desafio
              </span>
              60 dias grátis ·{" "}
              <ChallengeCountdownDisplay compact className="inline tabular-nums text-[#e8d5a3]" />
            </p>
            <Link
              to={CHALLENGE_PATH}
              search={{ desafio: "60" }}
              className="shrink-0 rounded-full bg-gradient-to-r from-[#e8d5a3] to-[#c9a961] px-3.5 py-1.5 text-xs font-semibold text-[#1a1612] shadow-[0_0_24px_-6px_rgba(201,169,97,0.65)] transition hover:brightness-105"
            >
              Quero participar
            </Link>
          </div>
        </div>
      ) : null}

      {modalOpen ? (
        <div
          className={`challenge-modal-overlay fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6 ${
            entered ? "challenge-modal-overlay--in" : ""
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="challenge-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissModal();
          }}
        >
          <div
            className={`challenge-modal relative w-full max-w-[440px] overflow-hidden rounded-[28px] sm:max-w-[480px] ${
              entered ? "challenge-modal--in" : ""
            }`}
          >
            {/* Atmosphere */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="challenge-modal__aurora absolute -left-1/4 -top-1/3 h-[70%] w-[90%] rounded-full blur-3xl" />
              <div className="challenge-modal__aurora2 absolute -bottom-1/4 -right-1/4 h-[55%] w-[70%] rounded-full blur-3xl" />
              <div className="challenge-modal__grain absolute inset-0 opacity-[0.07]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e8d5a3]/70 to-transparent" />
            </div>

            <button
              type="button"
              aria-label="Fechar"
              onClick={dismissModal}
              className="absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full border border-white/10 bg-black/25 text-[#f7f1e6]/70 backdrop-blur-md transition hover:border-white/25 hover:bg-black/40 hover:text-white"
            >
              <X className="size-4" />
            </button>

            <div className="relative z-10 px-6 pb-7 pt-8 sm:px-9 sm:pb-9 sm:pt-10">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#c9a961]/35 bg-[#c9a961]/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e8d5a3]">
                  <Sparkles className="size-3.5" aria-hidden />
                  Edição limitada
                </span>
              </div>

              <div className="relative mt-5">
                <p
                  className="challenge-modal__sixty pointer-events-none absolute -top-6 right-0 select-none font-display text-[7.5rem] leading-none text-[#e8d5a3] opacity-[0.08] sm:-top-8 sm:text-[9rem]"
                  aria-hidden
                >
                  60
                </p>
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#e8d5a3]/80">
                  JM BeautyFlow · Desafio
                </p>
                <h2
                  id="challenge-modal-title"
                  className="mt-2 max-w-[18ch] font-display text-[1.85rem] leading-[1.12] text-[#faf6ee] sm:text-[2.15rem]"
                >
                  {CHALLENGE_HEADLINE}
                </h2>
                <p className="mt-3 max-w-[34ch] text-[0.95rem] leading-relaxed text-[#d4cbb8]/90">
                  {CHALLENGE_SUBHEAD}
                </p>
              </div>

              <ul className="mt-6 grid gap-2.5 text-sm text-[#f0e8d8]/90">
                {[
                  "Melhor plano liberado — sem cartão",
                  "Agenda online com a cara do seu negócio",
                  "Clientes agendam sozinhas, 24h",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#c9a961] shadow-[0_0_10px_rgba(201,169,97,0.8)]" />
                    {line}
                  </li>
                ))}
              </ul>

              <div className="mt-7 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e8d5a3]/85">
                    <CalendarDays className="size-3.5" aria-hidden />
                    Termina em
                  </p>
                  <span className="challenge-modal__live text-[10px] font-medium uppercase tracking-wider text-[#9aefb0]">
                    Ao vivo
                  </span>
                </div>
                <ChallengeCountdownDisplay variant="lux" />
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={goDesafio}
                  className="challenge-modal__cta group inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-[#1a1612] transition"
                >
                  Quero meus 60 dias grátis
                  <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </button>
                <button
                  type="button"
                  onClick={dismissModal}
                  className="inline-flex min-h-10 items-center justify-center rounded-full px-5 text-sm text-[#b5a993] transition hover:text-[#f7f1e6]"
                >
                  Agora não
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
