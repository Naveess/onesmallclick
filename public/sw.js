// Phase Q1b-2: the game's small background script. It does two things and nothing else:
//  1. Shows a notification when a push arrives. The push itself carries no text, so it asks /api/notice what to show
//     (for this browser's own push address), and falls back to a general line if that fails.
//  2. Shows a plain "the probe needs a connection" page when the game can't be reached.
// It stores nothing but that one page, so a deploy always shows straight away.

const OFFLINE = "/offline.html";
const CACHE = "osc-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return; // everything else goes straight to the network
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});

async function show() {
  let notice = null;
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (sub) {
      const res = await fetch("/api/notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (res.ok) notice = await res.json();
    }
  } catch (e) {
    // fall through to the general line
  }
  notice = notice || { title: "OneSmallClick", body: "The probe could use you. Open the game to see.", url: "/", tag: "osc" };
  // Every push must show something, or the browser shows its own "this site updated in the background".
  await self.registration.showNotification(notice.title, {
    body: notice.body,
    icon: "/app/app-192.png",
    badge: "/app/badge-96.png",
    tag: notice.tag || "osc",
    data: { url: notice.url || "/" },
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil(show());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
