import { useEffect, useState, type FormEvent } from "react";
import type { AdminState } from "../../shared/mission";
import { PixelButton } from "../components/PixelButton";
import { Sky } from "../components/Sky";
import { Window } from "../components/Window";
import { int } from "../game/format";
import { useDocumentTitle, useNoIndex } from "./useDocumentTitle";
import "./AdminPage.css";

// /admin: test controls for the shared probe. Not linked anywhere, noindex.
// The key is checked by the Worker on every call; this page keeps it only for this tab.

const KEY_STORE = "osc.adminKey";

function readKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

function saveKey(key: string) {
  try {
    if (key) sessionStorage.setItem(KEY_STORE, key);
    else sessionStorage.removeItem(KEY_STORE);
  } catch {
    // storage blocked: the key just isn't remembered
  }
}

async function call(key: string, action: string, body?: object): Promise<AdminState> {
  const res = await fetch(`/api/admin/${action}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${key}`, ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as AdminState;
}

const when = (ms: number) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never");

export function AdminPage() {
  useDocumentTitle("Admin · OneSmallClick");
  useNoIndex();
  const [key, setKey] = useState(readKey);
  const [draftKey, setDraftKey] = useState("");
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [km, setKm] = useState("");
  const [hours, setHours] = useState("24");
  const [seconds, setSeconds] = useState("70");

  const run = async (action: string, body?: object, k = key) => {
    setBusy(true);
    setError("");
    try {
      setState(await call(k, action, body));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (key) void run("state");
    // Only on first load with a remembered key.
  }, []);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    if (await run("state", undefined, draftKey)) {
      setKey(draftKey);
      saveKey(draftKey);
      setDraftKey("");
    }
  };

  const signOut = () => {
    setKey("");
    saveKey("");
    setState(null);
  };

  const p = state?.probe;
  const speed = p ? p.coastKmS + p.crewKmS : 0;
  const setbackKm = p && state ? (state.setbackMs / 1000) * p.coastKmS : 0;
  const arrival = p && state ? state.serverNow + ((p.routeKm + setbackKm - p.distanceKm) / speed) * 1000 : 0;
  const signalLeftS = p && state ? Math.max(0, (p.signalDeadline - state.serverNow) / 1000) : 0;

  return (
    <>
      <Sky fixed />
      <main className="admin">
        <h1 className="admin__title">Mission admin</h1>
        <p className="admin__lede">Test controls for the shared probe. Every change reaches every open screen.</p>

        {!key || !state ? (
          <Window as="form" className="admin__card" onSubmit={signIn} aria-labelledby="admin-key-label">
            <label id="admin-key-label" className="admin__field">
              <span className="label">Admin key</span>
              <input
                type="password"
                autoComplete="current-password"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                required
              />
            </label>
            <PixelButton type="submit" disabled={busy || !draftKey}>
              Open
            </PixelButton>
            {error && (
              <p className="admin__error" role="alert">
                {error}
              </p>
            )}
          </Window>
        ) : (
          <>
            <Window as="section" className="admin__card" aria-labelledby="admin-state">
              <h2 id="admin-state" className="admin__h2">
                Mission {p!.missionId} · {p!.destination}
              </h2>
              <dl className="admin__stats">
                <div>
                  <dt>Distance</dt>
                  <dd className="num">
                    {int(p!.distanceKm)} / {int(p!.routeKm)} km
                  </dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd className="num">
                    {p!.coastKmS} + {p!.crewKmS.toFixed(2)} crew = {speed.toFixed(2)} km/s
                  </dd>
                </div>
                <div>
                  <dt>Arrival</dt>
                  <dd className="num">{when(arrival)}</dd>
                </div>
                <div>
                  <dt>Signal</dt>
                  <dd className="num">
                    {p!.safeSince !== null
                      ? `SAFE MODE since ${when(p!.safeSince)} · setback so far ${(state.setbackMs / 3_600_000).toFixed(1)} h`
                      : `${Math.floor(signalLeftS / 3600)} h ${Math.floor((signalLeftS % 3600) / 60)} min ${Math.floor(signalLeftS % 60)} s left`}
                  </dd>
                </div>
                <div>
                  <dt>Devices here</dt>
                  <dd className="num">
                    {p!.online} ({state.sockets} sockets)
                  </dd>
                </div>
                <div>
                  <dt>Server clock</dt>
                  <dd className="num">
                    {when(state.serverNow)}
                    {state.clockOffsetMs > 0 && ` (+${(state.clockOffsetMs / 3_600_000).toFixed(1)} h)`}
                  </dd>
                </div>
                <div>
                  <dt>Mission started</dt>
                  <dd className="num">{when(p!.missionStartedAt)}</dd>
                </div>
                <div>
                  <dt>Last saved / D1 flush</dt>
                  <dd className="num">
                    {when(state.lastSavedAt)} / {when(state.lastD1FlushAt)}
                  </dd>
                </div>
              </dl>
              <div className="admin__row">
                <PixelButton variant="outline" onClick={() => void run("state")} disabled={busy}>
                  Refresh
                </PixelButton>
                <PixelButton variant="outline" onClick={signOut}>
                  Forget key
                </PixelButton>
              </div>
            </Window>

            <Window
              as="form"
              className="admin__card"
              aria-labelledby="admin-distance"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run("distance", { km: Number(km.replace(/[,\s_]/g, "")) });
              }}
            >
              <h2 id="admin-distance" className="admin__h2">
                Set the distance
              </h2>
              <label className="admin__field">
                <span className="label">Km travelled</span>
                <input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} placeholder="240000000" required />
              </label>
              <PixelButton type="submit" disabled={busy}>
                Set distance
              </PixelButton>
            </Window>

            <Window
              as="form"
              className="admin__card"
              aria-labelledby="admin-clock"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run("clock", { hours: Number(hours) });
              }}
            >
              <h2 id="admin-clock" className="admin__h2">
                Move the clock forward
              </h2>
              <p className="admin__note">The probe coasts through the hours you skip. Reset the mission to undo.</p>
              <label className="admin__field">
                <span className="label">Hours</span>
                <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} required />
              </label>
              <PixelButton type="submit" disabled={busy}>
                Move forward
              </PixelButton>
            </Window>

            <Window
              as="form"
              className="admin__card"
              aria-labelledby="admin-signal"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run("signal", { seconds: Number(seconds) });
              }}
            >
              <h2 id="admin-signal" className="admin__h2">
                Set the signal timer
              </h2>
              <p className="admin__note">
                Seconds until the signal runs out. 70 shows the final-minute pulse from 60; 0 drops the probe into safe
                mode now. A value above 0 also ends safe mode without a setback (a test override, not a ping).
              </p>
              <label className="admin__field">
                <span className="label">Seconds</span>
                <input inputMode="numeric" value={seconds} onChange={(e) => setSeconds(e.target.value)} required />
              </label>
              <div className="admin__row">
                <PixelButton type="submit" disabled={busy}>
                  Set timer
                </PixelButton>
                <PixelButton variant="outline" disabled={busy} onClick={() => void run("clear-ping", {})}>
                  Let this browser ping again today
                </PixelButton>
              </div>
            </Window>

            <Window as="section" tone="orange" className="admin__card" aria-labelledby="admin-reset">
              <h2 id="admin-reset" className="admin__h2">
                Reset the mission
              </h2>
              <p className="admin__note">Starts mission {p!.missionId + 1} at 0 km with a full signal, and puts the clock back to real time.</p>
              <PixelButton
                variant="orange"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Reset? Mission ${p!.missionId} ends and a new one starts at 0 km.`)) void run("reset", {});
                }}
              >
                Reset mission
              </PixelButton>
            </Window>

            {error && (
              <p className="admin__error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
