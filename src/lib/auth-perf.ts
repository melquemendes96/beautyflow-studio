/** Logs de performance de auth — apenas em desenvolvimento. */

const enabled = import.meta.env.DEV;

export function authPerf(label: string, extra?: Record<string, unknown>) {
  if (!enabled) return;
  if (extra) {
    console.debug(`[auth-perf] ${label}`, extra);
  } else {
    console.debug(`[auth-perf] ${label}`);
  }
}

export async function authPerfTimed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const t0 = performance.now();
  try {
    const result = await fn();
    authPerf(`${label} ok`, { ms: Math.round(performance.now() - t0) });
    return result;
  } catch (e) {
    authPerf(`${label} erro`, { ms: Math.round(performance.now() - t0), error: String(e) });
    throw e;
  }
}
