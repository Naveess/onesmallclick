import { FEEDBACK_KIND_NAMES, type FeedbackItem } from "../../shared/feedback";
import { useEffect, useState, type FormEvent } from "react";
import { BETA, BETA_ENDS_MS, LAUNCH_WIPE_PHRASE } from "../../shared/beta";
import type { PlayersReport } from "../../shared/nudges";
import { IDLE_PAUSE_MS, arrivalAt, crewSpeed, probeClock, type AdminState } from "../../shared/mission";
import { PixelButton } from "../components/PixelButton";
import { Sky } from "../components/Sky";
import { Window } from "../components/Window";
import { int } from "../game/format";
import { useDocumentTitle, useNoIndex } from "./useDocumentTitle";
import { PlayersTab } from "./admin/PlayersTab";
import type { AdminWho } from "../../shared/admin";
import "./AdminPage.css";

// /admin: the admin panel. Not linked anywhere, noindex.
// Phase A1a: signing in needs the game's Google sign-in (an allowlisted account) plus the admin key; the Worker then
// sets a 12-hour admin cookie, sent with every /api/admin call. Tabs: Players, Game (the test controls), Reports.

async function call(_who: string, action: string, body?: object): Promise<AdminState> {
  const res = await fetch(`/api/admin/${action}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body && JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as AdminState;
}

interface NetworkReport {
  cap: { ping: number; vote: number };
  networks: number;
  top: { net: string; pings: number; votes: number }[];
}

/** Today's busiest networks against the per-network cap (phase 9a). Hash prefixes only: no addresses. */
function NetworkCap({ adminKey }: { adminKey: string }) {
  const [report, setReport] = useState<NetworkReport | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/networks", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setReport((await res.json()) as NetworkReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  useEffect(() => {
    void load();
  }, [adminKey]);
  return (
    <Window as="section" className="admin__card" aria-labelledby="admin-networks">
      <h2 id="admin-networks" className="admin__h2">
        Network cap · today
      </h2>
      <p className="admin__note">
        Each network (an IPv4 address or an IPv6 /64, stored only as a daily hash) gets {report?.cap.ping ?? "…"} pings and{" "}
        {report?.cap.vote ?? "…"} votes a day. Only ones that went through count. {report ? `${report.networks} networks so far today.` : ""}
      </p>
      {report && report.top.length > 0 && (
        <ul className="admin__note">
          {report.top.map((n) => (
            <li key={n.net} className="num">
              {n.net} · {n.pings} pings · {n.votes} votes
            </li>
          ))}
        </ul>
      )}
      {error && <p className="admin__note">Couldn't load: {error}</p>}
      <div className="admin__row">
        <PixelButton variant="outline" onClick={() => void load()}>
          Refresh
        </PixelButton>
      </div>
    </Window>
  );
}

interface ShareReport {
  since: string;
  crewLinks: number;
  rows: { day: string; moment: string; channel: string; shares: number; visits: number }[];
  /** Phase S2: the K-factor over the same 7 days (worker/share.ts shareReport). */
  k: {
    players: number;
    shares: number;
    visits: number;
    arrived: number;
    recruits: number;
    overCap: number;
    notCounted: number;
    waiting: number;
    i: number;
    c: number;
    k: number;
    medianCycleMs: number | null;
  };
}

/** "3 h 20 min", "12 min", "40 s": the cycle time. */
function cycle(ms: number | null): string {
  if (ms === null) return "none yet";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ${m % 60} min` : `${Math.round(h / 24)} days`;
}

/** The K-factor over the last 7 days (phase S2): K = i × c. Above 1, each player brings in more than one. */
function KFactor({ k }: { k: ShareReport["k"] }) {
  return (
    <div className="admin__note">
      <p className="num" style={{ fontSize: 28, lineHeight: 1.1, color: k.k >= 1 ? "var(--text-orange)" : "var(--text-blue)" }}>
        K = {k.k.toFixed(2)}
      </p>
      <ul>
        <li className="num">
          i = {k.i.toFixed(2)} shares per active player ({k.shares} shares ÷ {k.players} players who pushed)
        </li>
        <li className="num">
          c = {k.c.toFixed(2)} recruits per share ({k.recruits} ÷ {k.shares})
        </li>
        <li className="num">
          {k.visits} link visits · {k.arrived} new players arrived · {k.recruits} played (recruits
          {k.overCap ? `, ${k.overCap} past a recruiter's 10 a day` : ""}) · {k.waiting} not yet · {k.notCounted} not counted (own
          account or an older one)
        </li>
        <li className="num">Cycle time (median, link opened to 50 taps or a Ping): {cycle(k.medianCycleMs)}</li>
      </ul>
    </div>
  );
}

/** Phase G1: the Players card. Counts only, never emails or device ids. */
function Players({ adminKey }: { adminKey: string }) {
  const [report, setReport] = useState<PlayersReport | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/players", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setReport((await res.json()) as PlayersReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  useEffect(() => {
    void load();
  }, [adminKey]);
  const r = report;
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
  return (
    <Window as="section" className="admin__card" aria-labelledby="admin-players">
      <h2 id="admin-players" className="admin__h2">
        Players
      </h2>
      {!r && !error && <p className="admin__note">…</p>}
      {r && (
        <ul className="admin__note">
          <li className="num">
            Accounts: {int(r.accounts.total)} · new {int(r.accounts.day)} in 24 h · {int(r.accounts.week)} in 7 days
          </li>
          <li className="num">
            Devices: {int(r.devices.total)} · new {int(r.devices.newDay)} in 24 h · active {int(r.devices.activeDay)} in 24 h
          </li>
          <li className="num">
            Guests to accounts (new players, last 7 days): {int(r.conversion.signedIn)} of {int(r.conversion.newPlayers)} signed in (
            {pct(r.conversion.signedIn, r.conversion.newPlayers)})
          </li>
          <li className="num">
            Today: {int(r.today.shares)} shares · {int(r.today.recruits)} recruits
          </li>
          <li className="num">
            Sign-ups by nudge: {r.signups.map((x) => `${x.source ?? "direct or older"} ${int(x.n)}`).join(" · ") || "none yet"}
          </li>
          <li className="num">
            New players by country (24 h): {r.newByCountry.map((x) => `${x.cc ?? "?"} ${int(x.n)}`).join(" · ") || "none"}
          </li>
          <li className="num">
            Players who pushed, by day: {r.pushed.map((x) => `${x.day.slice(5)} ${int(x.players)}`).join(" · ") || "none"}
          </li>
        </ul>
      )}
      {error && <p className="admin__note">Couldn't load: {error}</p>}
      <div className="admin__row">
        <PixelButton variant="outline" onClick={() => void load()}>
          Refresh
        </PixelButton>
      </div>
    </Window>
  );
}

interface BetaReport {
  accounts: number;
  players: { name: string; country: string | null; at: number }[];
}

/** Prompts 82-83: who has the Early Beta badge (accounts signed in before launch), oldest first. */
function EarlyBeta({ adminKey }: { adminKey: string }) {
  const [report, setReport] = useState<BetaReport | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/beta", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setReport((await res.json()) as BetaReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  useEffect(() => {
    void load();
  }, [adminKey]);
  return (
    <Window as="section" className="admin__card" aria-labelledby="admin-beta">
      <h2 id="admin-beta" className="admin__h2">
        Early Beta · until {BETA.launchLabel}
      </h2>
      <p className="admin__note">
        {report ? `${int(report.players.length)} of ${int(report.accounts)} accounts have the Early Beta badge.` : "…"} Every
        account signed in before {new Date(BETA_ENDS_MS).toISOString().slice(0, 16).replace("T", " ")} UTC gets it (content/beta.json).
        Guests don't, until they sign in.
      </p>
      {report && report.players.length > 0 && (
        <ol className="admin__note">
          {report.players.map((p) => (
            <li key={p.name} className="num">
              {p.name} · {p.country ?? "–"} · {new Date(p.at).toISOString().slice(0, 10)}
            </li>
          ))}
        </ol>
      )}
      {error && <p className="admin__note">Couldn't load: {error}</p>}
      <div className="admin__row">
        <PixelButton variant="outline" onClick={() => void load()}>
          Refresh
        </PixelButton>
      </div>
    </Window>
  );
}

/** Shares and crew-link visits over the last 7 days (phase S1), and the K-factor (phase S2). Counters only. */
function Shares({ adminKey }: { adminKey: string }) {
  const [report, setReport] = useState<ShareReport | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/shares", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setReport((await res.json()) as ShareReport);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  useEffect(() => {
    void load();
  }, [adminKey]);
  const total = (k: "shares" | "visits") => report?.rows.reduce((n, r) => n + r[k], 0) ?? 0;
  return (
    <Window as="section" className="admin__card" aria-labelledby="admin-shares">
      <h2 id="admin-shares" className="admin__h2">
        Sharing and K-factor · last 7 days
      </h2>
      {report?.k && <KFactor k={report.k} />}
      <p className="admin__note">
        {report
          ? `${total("shares")} shares, ${total("visits")} crew-link visits since ${report.since}. ${report.crewLinks} players have a crew link.`
          : "…"}{" "}
        A share is a share button pressed; a visit is a crew link opened in the game (not your own, not link-preview robots).
      </p>
      {report && report.rows.length > 0 && (
        <ul className="admin__note">
          {report.rows.map((r) => (
            <li key={`${r.day}-${r.moment}-${r.channel}`} className="num">
              {r.day} · {r.moment} · {r.channel} · {r.shares} shares · {r.visits} visits
            </li>
          ))}
        </ul>
      )}
      {error && <p className="admin__note">Couldn't load: {error}</p>}
      <div className="admin__row">
        <PixelButton variant="outline" onClick={() => void load()}>
          Refresh
        </PixelButton>
      </div>
    </Window>
  );
}

const when = (ms: number) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never");
/** Rows written an hour since the probe started (storage is billed by rows written), from its counters. */
const perHour = (rows: number, state: AdminState) => {
  const hours = Math.max(1 / 60, (Date.now() - state.rowsWritten.since) / 3_600_000);
  return Math.round(rows / hours).toLocaleString("en-GB");
};

/** Phase Q1b-1: the Discord bot. A test post, and the latest posts with what happened to each. */
function Discord({ state, busy, onTest }: { state: AdminState; busy: boolean; onTest: () => void }) {
  const d = state.discord;
  if (!d) return null;
  return (
    <Window as="section" className="admin__card" aria-labelledby="admin-discord">
      <h2 id="admin-discord" className="admin__h2">
        Discord bot · {d.webhook ? "webhook set" : "no webhook (posts are only listed here)"}
      </h2>
      <p className="admin__note">
        Posts the big moments to the mission-log channel: milestones, arrivals, the daily vote and its result, the landing
        burn, the signal's final hour, safe mode and saves, and the crew goal. At most one post a minute; several moments
        go together. {d.pending} waiting. "Send a test post" goes to the real channel straight away and shows what Discord
        answered (the newest line below).
      </p>
      {d.recent.length > 0 && (
        <ul className="admin__feedback">
          {d.recent.map((p) => (
            <li key={p.id} className="admin__fb">
              <p className="admin__fb-head">
                <strong>{p.title}</strong> · {when(p.at)} · {p.sentAt ? (p.note ?? "sent") : `waiting${p.note ? ` (${p.note})` : ""}`}
              </p>
              <p className="admin__fb-msg">{p.text}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="admin__row">
        <PixelButton variant="outline" onClick={onTest} disabled={busy}>
          Send a test post
        </PixelButton>
      </div>
    </Window>
  );
}

/** Phase Q1a: "Report a bug or idea" items, newest first, each marked done by hand (deleted 90 days after). */
function Feedback({ adminKey }: { adminKey: string }) {
  const [report, setReport] = useState<{ open: number; items: FeedbackItem[] } | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try {
      const res = await fetch("/api/admin/feedback", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      setReport((await res.json()) as { open: number; items: FeedbackItem[] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const mark = async (id: number, done: boolean) => {
    try {
      await call(adminKey, "feedback-done", { id, done });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  useEffect(() => {
    void load();
  }, [adminKey]);
  return (
    <Window as="section" className="admin__card" aria-labelledby="admin-feedback">
      <h2 id="admin-feedback" className="admin__h2">
        Feedback{report ? ` · ${report.open} new` : ""}
      </h2>
      <p className="admin__note">
        Bug reports and ideas from "Report a bug or idea". Done items are deleted 90 days later. An email shows only when
        a signed-in player ticked "contact me".
      </p>
      {report && report.items.length === 0 && <p className="admin__note">Nothing yet.</p>}
      {report && report.items.length > 0 && (
        <ul className="admin__feedback">
          {report.items.map((f) => (
            <li key={f.id} className={f.doneAt ? "admin__fb admin__fb--done" : "admin__fb"}>
              <p className="admin__fb-head">
                <strong>{FEEDBACK_KIND_NAMES[f.kind]}</strong> · {when(f.at)}
                {f.page ? ` · ${f.page}` : ""}
              </p>
              <p className="admin__fb-msg">{f.message}</p>
              {f.contact && (
                <p className="admin__note">
                  Contact: {f.contact.name}
                  {f.contact.email ? ` · ${f.contact.email}` : " · signed in with Google (no email stored)"}
                </p>
              )}
              {f.info && <p className="admin__fb-info">{f.info}</p>}
              <PixelButton variant="outline" onClick={() => void mark(f.id, !f.doneAt)}>
                {f.doneAt ? `Done ${when(f.doneAt)} · reopen` : "Mark done"}
              </PixelButton>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="admin__note">Couldn't load: {error}</p>}
      <div className="admin__row">
        <PixelButton variant="outline" onClick={() => void load()}>
          Refresh
        </PixelButton>
      </div>
    </Window>
  );
}

export function AdminPage() {
  useDocumentTitle("Admin · OneSmallClick");
  useNoIndex();
  // The signed-in admin's email ("" until signed in), and the sign-in form.
  const [key, setKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [checking, setChecking] = useState(true);
  const [game, setGame] = useState<{ email: string | null; google: boolean } | null>(null);
  const [tab, setTab] = useState<"players" | "game" | "reports">("players");
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [km, setKm] = useState("");
  const [hours, setHours] = useState("24");
  const [legDays, setLegDays] = useState("24");
  const [burnMinutes, setBurnMinutes] = useState("60");
  const [wipeText, setWipeText] = useState("");
  const [burnTarget, setBurnTarget] = useState("2000000");
  const [seconds, setSeconds] = useState("70");
  const [give, setGive] = useState("100000");
  const [goalKm, setGoalKm] = useState("20000");

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

  // An admin session already open? Otherwise, who is signed in to the game (for the sign-in form).
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/whoami", { cache: "no-store" });
        if (res.ok) {
          const who = (await res.json()) as AdminWho;
          setKey(who.email);
          await run("state", undefined, who.email);
        } else {
          const s = await (await fetch("/api/session", { cache: "no-store" })).json().catch(() => ({}));
          const a = (s as { account?: { email?: string | null; google?: boolean } | null }).account;
          setGame(a ? { email: a.email ?? null, google: !!a.google } : null);
        }
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: draftKey }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
      setDraftKey("");
      setKey((data as AdminWho).email);
      await run("state", undefined, (data as AdminWho).email);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await fetch("/api/admin/signout", { method: "POST" }).catch(() => {});
    setKey("");
    setState(null);
  };

  const p = state?.probe;
  const speed = p ? p.coastKmS + p.crewKmS : 0;
  const arrival = p && state ? arrivalAt(p, p.distanceKm, state.serverNow) : null;
  const signalLeftS = p && state ? Math.max(0, (p.signalDeadline - probeClock(p, state.serverNow)) / 1000) : 0;
  const raw = state ? state.crewRawKmS + state.autoRawKmS : 0;
  const hm = (ms: number) => `${Math.floor(ms / 3_600_000)} h ${Math.floor((ms % 3_600_000) / 60_000)} min`;

  return (
    <>
      <Sky fixed />
      <main className="admin">
        <h1 className="admin__title">Mission admin</h1>

        {checking ? (
          <p className="admin__lede">Checking…</p>
        ) : !key ? (
          <Window as="form" className="admin__card" onSubmit={signIn} aria-labelledby="admin-key-label">
            <h2 className="admin__h2">Sign in</h2>
            <p className="admin__note">
              {game?.email
                ? `Signed in to the game as ${game.email}${game.google ? " (Google)" : " (email link: the panel needs Google)"}.`
                : "First sign in to the game with your Google account, then come back here."}{" "}
              <a href="/sign-in">Game sign-in</a>
            </p>
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
            <div className="admin__top">
              <p className="admin__note">
                {key} · owner · <button type="button" className="admin__link" onClick={() => void signOut()}>Sign out</button>
              </p>
              <div className="admin__tabs" role="tablist" aria-label="Admin sections">
                {(["players", "game", "reports"] as const).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "admin__tab admin__tab--on" : "admin__tab"} onClick={() => setTab(t)}>
                    {t === "players" ? "Players" : t === "game" ? "Game" : "Reports"}
                  </button>
                ))}
              </div>
            </div>

            {tab === "players" && <PlayersTab />}

            {tab === "reports" && (
              <>
                <Feedback adminKey={key} />
                {state && <Discord state={state} busy={busy} onTest={() => void run("discord-test", {})} />}
                <Players adminKey={key} />
                <Shares adminKey={key} />
                <NetworkCap adminKey={key} />
                <EarlyBeta adminKey={key} />
              </>
            )}

            {tab === "game" && state && (
            <>
            <p className="admin__lede">Test controls for the shared probe. Every change reaches every open screen.</p>
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
                  <dt>Speed now</dt>
                  <dd className="num">
                    {p!.coastKmS} coasting + {p!.crewKmS.toFixed(2)} crew = {speed.toFixed(2)} km/s
                  </dd>
                </div>
                <div>
                  <dt>Today's pace</dt>
                  <dd className="num">{p!.paceKmS.toFixed(2)} km/s (last 24 h of moving; the arrival date uses it)</dd>
                </div>
                <div>
                  <dt>Arrival</dt>
                  <dd className="num">{arrival === null ? "on hold (paused)" : when(arrival)}</dd>
                </div>
                <div>
                  <dt>Idle pause</dt>
                  <dd className="num">
                    {p!.pausedSince !== null
                      ? `PAUSED since ${when(p!.pausedSince)}: one tap wakes it`
                      : state.pausesAt === null
                        ? "can't pause: auto-thrust is connected"
                        : `pauses ${when(state.pausesAt)} unless someone taps (last activity ${when(state.lastActiveAt)}, ${hm(
                            Math.max(0, state.pausesAt - state.serverNow),
                          )} left of ${IDLE_PAUSE_MS / 3_600_000} h)`}
                  </dd>
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
                  <dt>Crew push (self-balancing)</dt>
                  <dd className="num">
                    raw {raw.toFixed(2)} km/s (last hour's taps and catch-ups {state.crewRawKmS.toFixed(2)} + auto{" "}
                    {state.autoRawKmS.toFixed(2)}) → moves the probe {crewSpeed(raw).toFixed(2)} km/s · each crew km moves it{" "}
                    {p!.crewFactor.toFixed(2)} km
                  </dd>
                </div>
                <div>
                  <dt>Devices here</dt>
                  <dd className="num">
                    {p!.online} ({state.sockets} sockets) · {p!.idling} idling · {state.players} with progress
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
                <div>
                  <dt>Rows written an hour (probe / D1)</dt>
                  <dd className="num">
                    {perHour(state.rowsWritten.sqlite, state)} / {perHour(state.rowsWritten.d1, state)}
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
              <p className="admin__note">
                The probe coasts through the hours you skip. With no tap and no connected auto-thrust (close the game
                tabs, or have no auto-thrust) for 8 hours, it pauses part-way. Reset the mission to undo.
              </p>
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
              aria-labelledby="admin-burn"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run("burn", { minutes: Number(burnMinutes), target: Number(burnTarget) });
              }}
            >
              <h2 id="admin-burn" className="admin__h2">
                Start the landing burn now
              </h2>
              <p className="admin__note">
                {state.probe.burn
                  ? `Burning: ${int(state.probe.burn.km)} of ${int(state.probe.burn.target)} km, landing ${when(state.probe.burn.landAt)}.`
                  : "E4b part 2b. Moves the probe to this many minutes from arrival at today's pace and starts the burn (it starts by itself an hour out). On live this changes the real probe: everyone sees it and the leg lands."}
              </p>
              <label className="admin__field">
                <span className="label">Minutes to landing (1–60)</span>
                <input inputMode="decimal" value={burnMinutes} onChange={(e) => setBurnMinutes(e.target.value)} required />
              </label>
              <label className="admin__field">
                <span className="label">Bar target, km</span>
                <input inputMode="numeric" value={burnTarget} onChange={(e) => setBurnTarget(e.target.value)} required />
              </label>
              <PixelButton type="submit" disabled={busy || !!state.probe.burn || state.probe.arrivedAt !== null}>
                Start the burn
              </PixelButton>
            </Window>

            <Window
              as="form"
              className="admin__card"
              aria-labelledby="admin-goal"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run("goal", { km: Number(goalKm.replace(/[,\s_]/g, "")) });
              }}
            >
              <h2 id="admin-goal" className="admin__h2">
                Crew goal today
              </h2>
              <p className="admin__note">
                {state.probe.goal
                  ? `${state.probe.goal.day}: ${int(state.probe.goal.km)} of ${int(state.probe.goal.targetKm)} km${state.probe.goal.reachedAt ? `, reached ${when(state.probe.goal.reachedAt)}` : ""}.`
                  : "Not set yet."}{" "}
                Phase Q1a. Set at 00:00 UTC to 1.2× the median of the last 7 days, at least 20,000 km. Setting a target
                un-reaches it, so a target under today's km shows the moment again. The bonus is paid at 00:00 UTC (to test
                it locally, move the clock forward 24 hours). On live, everyone sees the change.
              </p>
              <label className="admin__field">
                <span className="label">Today's target, km</span>
                <input inputMode="numeric" value={goalKm} onChange={(e) => setGoalKm(e.target.value)} required />
              </label>
              <PixelButton type="submit" disabled={busy}>
                Set the target
              </PixelButton>
            </Window>

            <Window
              as="form"
              className="admin__card"
              aria-labelledby="admin-leg-start"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run("leg-start", { days: Number(legDays) });
              }}
            >
              <h2 id="admin-leg-start" className="admin__h2">
                Set when this leg launched
              </h2>
              <p className="admin__note">
                For testing medals (E4b): the leg launched this many days ago, so arriving now (set the distance to the
                end) earns that day's medal. Gold up to 25 days, Silver up to 30, Bronze after. Try 23.5, 27.5 and 32.5.
              </p>
              <label className="admin__field">
                <span className="label">Days ago</span>
                <input inputMode="decimal" value={legDays} onChange={(e) => setLegDays(e.target.value)} required />
              </label>
              <PixelButton type="submit" disabled={busy}>
                Set the launch
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

            <Window as="section" className="admin__card" aria-labelledby="admin-vote">
              <h2 id="admin-vote" className="admin__h2">
                Today's vote · round {p!.vote.round}
              </h2>
              <ul className="admin__note">
                {p!.vote.options.map((o) => (
                  <li key={o.id}>
                    {o.votes} · {o.label}
                  </li>
                ))}
              </ul>
              <p className="admin__note">
                Closes {when(p!.vote.closesAt)}. Closing now applies the winner's effect to the route, writes the result
                to the log and opens a new round.
              </p>
              <div className="admin__row">
                <PixelButton disabled={busy} onClick={() => void run("close-vote", {})}>
                  Close today's vote now
                </PixelButton>
                <PixelButton variant="outline" disabled={busy} onClick={() => void run("clear-vote", {})}>
                  Let this browser vote again
                </PixelButton>
              </div>
            </Window>


            <Window
              as="form"
              className="admin__card"
              aria-labelledby="admin-give"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void run("give", { km: Number(give.replace(/[,\s_]/g, "")) });
              }}
            >
              <h2 id="admin-give" className="admin__h2">
                Give this browser km
              </h2>
              <p className="admin__note">
                Adds credits and prestige progress to this browser's own idle game, as if it had pushed that far. The
                shared probe doesn't move. 2,000,000 unlocks the handover.
              </p>
              <label className="admin__field">
                <span className="label">Km</span>
                <input inputMode="numeric" value={give} onChange={(e) => setGive(e.target.value)} required />
              </label>
              <PixelButton type="submit" disabled={busy}>
                Give km
              </PixelButton>
            </Window>

            <Window as="section" tone="orange" className="admin__card" aria-labelledby="admin-reset">
              <h2 id="admin-reset" className="admin__h2">
                Reset mission (keep players)
              </h2>
              <p className="admin__note">
                The launch reset (decision 6). Starts mission {p!.missionId + 1} now, on real time: 0 km, the full route,
                a full signal, no milestones, a fresh vote round and an empty mission log. Devices, pings, streaks,
                progress, credits, upgrades and patches are all kept.
              </p>
              <PixelButton
                variant="orange"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Reset mission (keep players)? Mission ${p!.missionId} ends and mission ${p!.missionId + 1} starts now at 0 km.`))
                    void run("reset", {});
                }}
              >
                Reset mission (keep players)
              </PixelButton>
            </Window>

            <Window as="form" tone="orange" className="admin__card" aria-labelledby="admin-wipe" onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (wipeText !== LAUNCH_WIPE_PHRASE) return;
              if (!window.confirm("The launch wipe can't be undone. Have you backed up D1?")) return;
              void run("launch-wipe", { confirm: wipeText }).then((ok) => ok && setWipeText(""));
            }}>
              <h2 id="admin-wipe" className="admin__h2">
                Launch wipe (phase B2)
              </h2>
              <p className="admin__note">
                Launch day ({BETA.launchLabel}): the game starts fresh. <strong>Back up D1 first</strong> (docs/todo.md);
                this can't be undone. Everyone's open game reconnects to mission {p!.missionId + 1}, Earth to Mars, on real time.
              </p>
              <ul className="admin__note">
                <li>Wiped: credits, upgrades, patches, km and the leaderboards, pings and streaks, votes, the mission log, milestones, missions, stamps, medals and planet tech, every badge except Early Beta, recruits, share counts.</li>
                <li>Kept: accounts and their sign-ins, devices (names and countries), crew links, Early Beta badges.</li>
              </ul>
              <label className="admin__field">
                <span className="label">Type {LAUNCH_WIPE_PHRASE} to confirm</span>
                <input value={wipeText} onChange={(e) => setWipeText(e.target.value)} autoComplete="off" spellCheck={false} />
              </label>
              <PixelButton type="submit" variant="orange" disabled={busy || wipeText !== LAUNCH_WIPE_PHRASE}>
                Wipe and launch
              </PixelButton>
            </Window>
            </>
            )}

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
