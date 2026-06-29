/* Service worker — PWA install + Web Push (iOS 16.4+ / Android). */

const CASH_SOUND_URL = "/sounds/cash-register.wav";
const DEFAULT_ICON = "/logo-beautyflow.png";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

function parsePushPayload(event) {
  const fallback = {
    title: "BeautyFlow",
    body: "",
    url: "/admin",
    icon: DEFAULT_ICON,
    kind: "booking",
    tag: "bf-notification",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      return { ...fallback, ...parsed };
    }
  } catch {
    if (event.data) {
      fallback.body = event.data.text();
    }
  }
  return fallback;
}

function buildNotificationOptions(payload) {
  const kind = payload.kind || "booking";
  const isPayment = kind === "payment";
  const soundUrl = new URL(CASH_SOUND_URL, self.location.origin).href;

  const options = {
    body: payload.body || "",
    icon: payload.icon || DEFAULT_ICON,
    badge: DEFAULT_ICON,
    tag: payload.tag || `bf-${kind}`,
    renotify: true,
    silent: false,
    data: {
      url: payload.url || "/admin/agenda",
      kind,
    },
    vibrate: isPayment ? [120, 60, 120, 60, 220, 80, 280] : [100, 50, 100],
  };

  if (isPayment) {
    options.requireInteraction = true;
    // Chrome/Android pode usar som customizado quando suportado.
    options.sound = soundUrl;
  }

  return options;
}

async function hasVisibleClient() {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return clientList.some((client) => client.visibilityState === "visible");
}

async function notifyOpenClients(payload) {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientList) {
    client.postMessage({ type: "bf-push", payload });
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    (async () => {
      const appIsOpen = await hasVisibleClient();

      if (appIsOpen) {
        await notifyOpenClients(payload);
        return;
      }

      await self.registration.showNotification(payload.title || "BeautyFlow", buildNotificationOptions(payload));
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/admin";
  const absolute = targetUrl.startsWith("http") ? targetUrl : new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.focus().then(() => client.navigate(absolute));
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(absolute);
      }
      return undefined;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "bf-play-cash-sound") {
    // Reservado para testes manuais no painel.
  }
});
