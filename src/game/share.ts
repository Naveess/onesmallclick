// Phase S1 (prompt 62): the app's side of sharing. Your crew code (fetched once, when you first open a
// share sheet), counting shares, and the invite banner for someone who arrived through a crew link.
// Rules and texts: shared/share.ts and content/share.json. Server: worker/share.ts.
// Signing in or out reloads the page, which clears the cached code.

import { useSyncExternalStore } from "react";
import { CODE_PATTERN, isChannel, isMoment, type Channel, type Moment } from "../../shared/share";

// ---------- Your crew code ----------

let code: string | null = null;
let codeFetch: Promise<string | null> | null = null;

/** This player's crew code, made on the server the first time it's asked for. Null if it can't be had (offline). */
export function crewCode(): Promise<string | null> {
  if (code) return Promise.resolve(code);
  codeFetch ??= fetch("/api/crew-link", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ code?: string }>) : Promise.reject(new Error(String(r.status)))))
    .then((b) => (code = b.code && CODE_PATTERN.test(b.code) ? b.code : null))
    .catch(() => null)
    .finally(() => {
      codeFetch = null; // try again next time if it failed
    });
  return codeFetch;
}

/** One share counted on the server (counters only). Fire and forget; survives the page going to another app. */
export function countShare(moment: Moment, channel: Channel) {
  try {
    void fetch("/api/share", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ m: moment, v: channel }),
    }).catch(() => {});
  } catch {
    // never let counting get in the way of sharing
  }
}

// ---------- The invite banner ----------

interface Invite {
  code: string;
  moment: Moment;
  channel: Channel;
  /** The crew link's owner, once the server has said; null while asking or if it's unknown or your own. */
  name: string | null;
  dismissed: boolean;
}

let invite: Invite | null = readInvite();

// Play at "/" from the start: the app's links keep the address bar's ?query (the test switches), so the crew
// link's own m, d and v mustn't stay there, and a reload shouldn't count a second visit.
if (invite) {
  const q = new URLSearchParams(window.location.search);
  const keep = new URLSearchParams();
  for (const k of ["crew", "ads"]) {
    const v = q.get(k);
    if (v !== null) keep.set(k, v);
  }
  window.history.replaceState(null, "", `/${keep.size ? `?${keep}` : ""}`);
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

/** A crew link in the address bar: /c/<code>?m=…&v=… */
function readInvite(): Invite | null {
  const m = window.location.pathname.match(/^\/c\/([^/]+)\/?$/);
  if (!m || !CODE_PATTERN.test(m[1])) return null;
  const q = new URLSearchParams(window.location.search);
  const moment = q.get("m");
  const channel = q.get("v");
  return {
    code: m[1],
    moment: isMoment(moment) ? moment : "invite",
    channel: isChannel(channel) ? channel : "copy",
    name: null,
    dismissed: false,
  };
}

let asked = false;

/** Once this browser has its device (after /api/session): ask whose link it is, which counts the visit. */
export function lookUpInvite() {
  if (!invite || asked) return;
  asked = true;
  const { code: c, moment, channel } = invite;
  fetch(`/api/crew/${c}?m=${moment}&v=${channel}`, { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ name: string; own: boolean }>) : null))
    .then((b) => {
      if (b && !b.own && invite) {
        invite = { ...invite, name: b.name };
        emit();
      }
    })
    .catch(() => {});
}

export function dismissInvite() {
  if (!invite) return;
  invite = { ...invite, dismissed: true };
  emit();
}

/** The name on the invite banner, or null when there's no banner to show. */
export function useInviteName(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (invite && !invite.dismissed ? invite.name : null),
  );
}
