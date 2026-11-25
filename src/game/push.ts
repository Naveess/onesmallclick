import { useEffect, useSyncExternalStore } from "react";
import type { PushKind, PushPrefs, PushState } from "../../shared/push";

// Phase Q1b-2: install as an app, and opt-in alerts (Web Push). This module registers the service worker
// (public/sw.js), tracks this browser's alert state and install prompt, and does the subscribing. The server side is
// worker/push.ts. Nothing here runs a push library: the browser's own PushManager does it.

export type PushStatus =
  | "checking"
  | "unsupported" // this browser can't show alerts
  | "ios-install" // an iPhone or iPad: alerts only work once the game is on the home screen
  | "blocked" // the player said no in the browser's own prompt; only the browser's site settings can change it
  | "off"
  | "on";

interface PushStore {
  status: PushStatus;
  prefs: PushPrefs;
  testAt: number | null;
  /** The browser offers an install button (Chrome, Edge, Android). */
  canInstall: boolean;
  /** The game is running as an installed app already. */
  installed: boolean;
  /** Something is being sent. */
  busy: boolean;
  error: string | null;
}

const ALL_ON: PushPrefs = { signal: true, burn: true, vote: true };
let store: PushStore = { status: "checking", prefs: ALL_ON, testAt: null, canInstall: false, installed: false, busy: false, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<PushStore>) => {
  store = { ...store, ...patch };
  listeners.forEach((fn) => fn());
};

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
/**
 * Which browser an iPhone is in (prompt 113), for the install steps: Safari; another browser (Chrome, Firefox, Edge,
 * Opera: each has its own Share button); or an app's built-in browser (Facebook, Instagram, TikTok and so on), which
 * can't add to the Home Screen at all. Discord's and WhatsApp's look like Safari, so the steps mention them too.
 */
export function iosBrowser(): "safari" | "other" | "in-app" {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|MicroMessenger|GSA\//.test(ua)) return "in-app";
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua)) return "other";
  return "safari";
}

const canPush = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let installPrompt: InstallPrompt | null = null;

/** Registers the service worker once (from main.tsx), and keeps the install prompt for the Install button. */
export function startApp() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    set({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    set({ canInstall: false, installed: true });
  });
  set({ installed: isStandalone() });
}

async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error ?? `status ${res.status}`);
  return out;
}

const subscription = async () => {
  const reg = await navigator.serviceWorker.ready;
  return { reg, sub: await reg.pushManager.getSubscription() };
};

/** Reads where this browser stands: supported, blocked, or on/off (asking the server for the switches). */
export async function refreshPush() {
  if (isIos() && !isStandalone()) return set({ status: "ios-install" });
  if (!canPush()) return set({ status: "unsupported" });
  if (Notification.permission === "denied") return set({ status: "blocked" });
  try {
    const { sub } = await subscription();
    if (!sub) return set({ status: "off" });
    const s = await post<PushState>("/api/push/state", { endpoint: sub.endpoint });
    set({ status: s.on ? "on" : "off", prefs: s.prefs, testAt: s.testAt });
  } catch {
    set({ status: "off" });
  }
}

const keyBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const ERRORS: Record<string, string> = {
  "busy-network": "Lots of browsers have turned alerts on from your network today. Please try again tomorrow.",
  wait: "You can send yourself one test alert an hour.",
};

async function guarded(fn: () => Promise<void>) {
  set({ busy: true, error: null });
  try {
    await fn();
  } catch (err) {
    set({ error: ERRORS[(err as Error).message] ?? "That didn't work. Check your connection and try again." });
  } finally {
    set({ busy: false });
  }
}

/** Turns alerts on: asks the browser's permission (this must be called from a tap), subscribes, tells the server. */
export function enablePush() {
  return guarded(async () => {
    // First, straight from the tap: some browsers only allow the permission prompt right after one.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return set({ status: permission === "denied" ? "blocked" : "off" });
    const config = await (await fetch("/api/push/config", { cache: "no-store" })).json();
    if (!config.available) throw new Error("unavailable");
    const { reg, sub: existing } = await subscription();
    const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) }));
    const s = await post<PushState>("/api/push/subscribe", { endpoint: sub.endpoint, prefs: store.prefs });
    set({ status: "on", prefs: s.prefs, testAt: s.testAt });
  });
}

/** Turns alerts off: the server forgets the address and the browser drops the subscription. */
export function disablePush() {
  return guarded(async () => {
    const { sub } = await subscription();
    if (sub) {
      await post("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    set({ status: "off" });
  });
}

export function setPushPref(kind: PushKind, on: boolean) {
  return guarded(async () => {
    const { sub } = await subscription();
    if (!sub) return;
    const prefs = { ...store.prefs, [kind]: on };
    set({ prefs }); // shown at once; the server catches up
    const s = await post<PushState>("/api/push/prefs", { endpoint: sub.endpoint, prefs });
    set({ prefs: s.prefs });
  });
}

/** "Send me a test alert": the server pushes this browser, and the service worker shows it. */
export function testPush() {
  return guarded(async () => {
    const { sub } = await subscription();
    if (!sub) return;
    await post("/api/push/test", { endpoint: sub.endpoint });
    set({ testAt: Date.now() });
  });
}

/** The browser's own install prompt (Chrome, Edge, Android). */
export async function installApp() {
  const p = installPrompt;
  if (!p) return;
  await p.prompt();
  const choice = await p.userChoice;
  if (choice.outcome === "accepted") {
    installPrompt = null;
    set({ canInstall: false });
  }
}

// ---------- The home page's "turn on alerts" card ----------

const FIRST_DAY_KEY = "osc-first-day";
const CARD_KEY = "osc-alerts-card";
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // not saved: the card just shows again next visit
  }
};

/** The card only shows from a player's second day here (a first visit is for playing), and never after "No thanks". */
export function alertsCardWanted(): boolean {
  const first = read(FIRST_DAY_KEY);
  if (!first) {
    write(FIRST_DAY_KEY, localDay());
    return false;
  }
  return first !== localDay() && read(CARD_KEY) !== "closed";
}

export function closeAlertsCard() {
  write(CARD_KEY, "closed");
  set({}); // re-render
}

export function usePush() {
  useEffect(() => {
    void refreshPush();
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => store,
  );
}
