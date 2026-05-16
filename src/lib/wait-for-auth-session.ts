import type { Session } from "@supabase/supabase-js";
import { isMasterAccount, resolveUserEmail } from "@/lib/auth-profile";
import { getSupabase } from "@/lib/supabaseClient";

const MAX_WAIT_MS = 4000;

/** Aguarda sessão OAuth propagar (hash na URL), com teto de tempo. */
export async function waitForValidSession(maxAttempts = 8): Promise<Session | null> {
  const supabase = getSupabase();
  const started = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (Date.now() - started > MAX_WAIT_MS) break;
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token || !session.user) {
      await sleep(120 * (attempt + 1));
      continue;
    }

    if (isMasterAccount(session) || resolveUserEmail(session) || attempt >= maxAttempts - 2) {
      return session;
    }

    await sleep(120 * (attempt + 1));
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token && session.user ? session : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
