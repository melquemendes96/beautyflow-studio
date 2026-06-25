/* Service worker — PWA install + Web Push (iOS 16.4+ / Android). */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let payload = { title: "BeautyFlow", body: "", url: "/admin", icon: "/logo-beautyflow.png" };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const { title, body, url, icon } = payload;
  event.waitUntil(
    self.registration.showNotification(title || "BeautyFlow", {
      body: body || "",
      icon: icon || "/logo-beautyflow.png",
      badge: "/logo-beautyflow.png",
      tag: payload.tag || "bf-notification",
      renotify: true,
      data: { url: url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/admin";
  const absolute =
    targetUrl.startsWith("http") ? targetUrl : new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
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
