/** Sons de notificação in-app (app aberto — o sino cuida do visual). */

const CASH_SOUND_URL = "/sounds/cash-register.wav";

let cashAudio: HTMLAudioElement | null = null;

function getCashAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!cashAudio) {
    cashAudio = new Audio(CASH_SOUND_URL);
    cashAudio.preload = "auto";
  }
  return cashAudio;
}

export function playPaymentNotificationSound(): void {
  const audio = getCashAudio();
  if (!audio) return;
  audio.currentTime = 0;
  void audio.play().catch(() => {
    /* autoplay bloqueado até interação do usuário */
  });
}

export function preloadNotificationSounds(): void {
  getCashAudio();
}
