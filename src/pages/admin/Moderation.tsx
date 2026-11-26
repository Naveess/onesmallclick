import { useEffect, useState, type FormEvent } from "react";
import { ADMIN_TEXT_MAX, type PlayerDetail } from "../../../shared/admin";
import {
  MOD_REASON_MAX,
  NET_BAN_MAX_DAYS,
  TAKE_OFF_PROBE_PHRASE,
  TIMEOUT_DAYS,
  type KmPreview,
  type ModItem,
  type ModKind,
  type ModerationView,
} from "../../../shared/moderation";
import { PixelButton } from "../../components/PixelButton";
import { Window } from "../../components/Window";

// Phase A2a (decisions 36-40 and 45): the player page's Moderation card. Warn, time out (1, 3, 7 or 14 days), hide from the
// boards, ban (permanent until lifted; the network too for 1-7 days). Each needs the reason the player will see; a ban
// asks for their name typed out. Active ones can be lifted. Remove a cheat's km from a day's boards, and if needed from
// the probe (asked twice: it changes everyone's trip), with Undo.

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const km = (n: number) => Math.round(n).toLocaleString("en-GB");

const KIND_LABEL: Record<ModKind, string> = { warn: "Warn", timeout: "Time out", hide: "Hide from boards", ban: "Ban" };

function line(m: ModItem): string {
  const parts = [`${when(m.at)} · ${KIND_LABEL[m.kind]}`];
  if (m.kind === "timeout" && m.until) parts.push(`until ${when(m.until)}`);
  if (m.kind === "ban") parts.push(m.netDays ? `+ network ${m.netDays} d (${m.networks} caught)` : "permanent");
  parts.push(m.admin);
  if (m.kind === "warn") parts.push(m.ackedAt ? `read ${when(m.ackedAt)}` : "not read yet");
  if (m.liftedAt) parts.push(`lifted ${when(m.liftedAt)} by ${m.liftedBy}${m.liftReason ? `: ${m.liftReason}` : ""}`);
  else if (!m.active && m.kind === "timeout") parts.push("ran out");
  return parts.join(" · ");
}

export function Moderation({ p, onChanged }: { p: PlayerDetail; onChanged: () => void }) {
  const [v, setV] = useState<ModerationView | null>(null);
  const [error, setError] = useState("");
  const load = () => call<ModerationView>(`/api/admin/moderation?key=${encodeURIComponent(p.key)}`).then(setV, (e: Error) => setError(e.message));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.key]);
  const done = (next: ModerationView) => {
    setV(next);
    onChanged();
  };

  return (
    <Window as="section" tone="orange" className="admin__card" aria-labelledby="pl-mod">
      <h2 id="pl-mod" className="admin__h2">
        Moderation
      </h2>
      {error && <p className="admin__error" role="alert">{error}</p>}
      {v && (
        <>
          <ModItems items={v.items} onDone={done} />
          <Act p={p} onDone={done} />
          <RemoveKm p={p} v={v} onDone={done} />
        </>
      )}
    </Window>
  );
}

function ModItems({ items, onDone }: { items: ModItem[]; onDone: (v: ModerationView) => void }) {
  const [lifting, setLifting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (items.length === 0) return <p className="admin__note">No warnings, time outs, hides or bans.</p>;
  const lift = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onDone(await call<ModerationView>("/api/admin/moderation-lift", { id: lifting, reason }));
      setLifting(null);
      setReason("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <ul className="admin__days">
      {items.map((m) => (
        <li key={m.id} className={m.active ? "admin__mod admin__mod--on" : "admin__mod"}>
          <span>
            {m.active ? <strong>Now · </strong> : null}
            {line(m)}
          </span>
          <span className="admin__mod-reason">“{m.reason}”</span>
          {m.active && lifting !== m.id && (
            <button type="button" className="admin__link" onClick={() => setLifting(m.id)}>
              {m.kind === "warn" ? "Withdraw" : "Lift"}
            </button>
          )}
          {lifting === m.id && (
            <form className="admin__fix" onSubmit={lift}>
              <label className="admin__field">
                <span className="label">Why (for the log)</span>
                <input value={reason} maxLength={ADMIN_TEXT_MAX} onChange={(e) => setReason(e.target.value)} required />
              </label>
              <PixelButton type="submit" disabled={busy || reason.trim().length < 3}>
                {m.kind === "warn" ? "Withdraw the warning" : `Lift the ${KIND_LABEL[m.kind].toLowerCase()}`}
              </PixelButton>
              <button type="button" className="admin__link" onClick={() => setLifting(null)}>
                Cancel
              </button>
              {error && <p className="admin__error" role="alert">{error}</p>}
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

function Act({ p, onDone }: { p: PlayerDetail; onDone: (v: ModerationView) => void }) {
  const [kind, setKind] = useState<ModKind>("warn");
  const [days, setDays] = useState<number>(1);
  const [net, setNet] = useState(0);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const name = p.profile.name;
  const needName = kind === "ban";
  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r = await call<ModerationView>("/api/admin/moderate", {
        key: p.key,
        kind,
        reason,
        ...(kind === "timeout" ? { days } : {}),
        ...(kind === "ban" && net > 0 ? { netDays: net } : {}),
        ...(needName ? { confirm: typed } : {}),
      });
      setMsg(
        kind === "warn"
          ? "Warned. They'll see it next time they play."
          : kind === "hide"
            ? "Hidden from the boards. Their Ranks page tells them."
            : "Done. Their open screens have reloaded with it (a save state was taken first).",
      );
      setReason("");
      setTyped("");
      onDone(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="admin__fix" onSubmit={go}>
      <label className="admin__field">
        <span className="label">Action</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as ModKind)}>
          <option value="warn">Warn (they tap OK)</option>
          <option value="timeout">Time out (a complete pause)</option>
          <option value="hide">Hide from the leaderboards</option>
          <option value="ban">Ban (until lifted)</option>
        </select>
      </label>
      {kind === "timeout" && (
        <label className="admin__field">
          <span className="label">For</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {TIMEOUT_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind === "ban" && (
        <label className="admin__field">
          <span className="label">Their network too (a school or office can share one)</span>
          <select value={net} onChange={(e) => setNet(Number(e.target.value))}>
            <option value={0}>No</option>
            {Array.from({ length: NET_BAN_MAX_DAYS }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Yes, for {d} day{d === 1 ? "" : "s"} from their next visit
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="admin__note">
        {kind === "timeout" || kind === "ban"
          ? `Covers ${p.kind === "account" ? "the account and its devices" : "this device"}. Taps, auto-thrust, offline pay, pings, votes, upgrades and shares don't count.`
          : kind === "hide"
            ? "They still play and help the probe; they're left off the boards, and told."
            : "A box they must tap OK on, next time they play."}
      </p>
      <label className="admin__field">
        <span className="label">Reason (the player sees this)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, MOD_REASON_MAX))} rows={2} required />
      </label>
      {needName && (
        <label className="admin__field">
          <span className="label">
            Type <strong>{name}</strong> to confirm
          </span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
      )}
      <PixelButton type="submit" variant={kind === "ban" || kind === "timeout" ? "orange" : "blue"} disabled={busy || reason.trim().length < 3 || (needName && typed !== name)}>
        {kind === "warn" ? "Send the warning" : kind === "timeout" ? `Time out for ${days} day${days === 1 ? "" : "s"}` : kind === "hide" ? "Hide from the boards" : "Ban"}
      </PixelButton>
      {msg && <p className="admin__note" role="status">{msg}</p>}
      {error && <p className="admin__error" role="alert">{error}</p>}
    </form>
  );
}

function RemoveKm({ p, v, onDone }: { p: PlayerDetail; v: ModerationView; onDone: (v: ModerationView) => void }) {
  const [day, setDay] = useState(v.days[0]?.day ?? "");
  const [pv, setPv] = useState<KmPreview | null>(null);
  const [amount, setAmount] = useState("");
  const [probe, setProbe] = useState(false);
  const [probeKm, setProbeKm] = useState("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [typed2, setTyped2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [undo, setUndo] = useState<number | null>(null);
  const [ver, setVer] = useState(0);
  const name = p.profile.name;

  useEffect(() => {
    setPv(null);
    if (!day) return;
    call<KmPreview>(`/api/admin/remove-km?key=${encodeURIComponent(p.key)}&day=${day}`).then(
      (r) => {
        setPv(r);
        setAmount(String(Math.round(r.km)));
        setProbeKm(String(Math.round(r.tapMovedKm)));
      },
      (e: Error) => setError(e.message),
    );
  }, [day, p.key, ver]);

  const go = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const r =
        undo !== null
          ? await call<ModerationView>("/api/admin/remove-km-undo", { logId: undo, reason, confirm: typed })
          : await call<ModerationView>("/api/admin/remove-km", {
              key: p.key,
              day,
              km: Number(amount),
              probeKm: probe ? Number(probeKm) : 0,
              reason,
              confirm: typed,
              ...(probe ? { confirmProbe: typed2 } : {}),
            });
      setMsg(undo !== null ? "Put back." : "Removed. A save state was taken first; it's listed below with Undo.");
      setUndo(null);
      setReason("");
      setTyped("");
      setTyped2("");
      setProbe(false);
      onDone(r);
      setVer((n) => n + 1); // the preview reloads with the new numbers
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const ready = reason.trim().length >= 3 && typed === name && (undo !== null || !probe || typed2 === TAKE_OFF_PROBE_PHRASE);

  return (
    <form className="admin__fix" onSubmit={go}>
      <h3 className="admin__h3">Remove a cheat's km</h3>
      {undo !== null ? (
        <p className="admin__note">
          Undoing a removal: their km go back on that day's boards (and on the probe, if it was taken off).{" "}
          <button type="button" className="admin__link" onClick={() => setUndo(null)}>
            Cancel
          </button>
        </p>
      ) : v.days.length === 0 ? (
        <p className="admin__note">No km in the last 30 days.</p>
      ) : (
        <>
          <label className="admin__field">
            <span className="label">Day (UTC)</span>
            <select value={day} onChange={(e) => setDay(e.target.value)}>
              {v.days.map((d) => (
                <option key={d.day} value={d.day}>
                  {d.day} · {km(d.km)} km
                </option>
              ))}
            </select>
          </label>
          {pv && (
            <>
              <p className="admin__note num">
                {km(pv.km)} km on the boards that day; their taps moved the probe {km(pv.tapMovedKm)} km. The probe is at {km(pv.probeKm)} km
                on this leg.
              </p>
              <label className="admin__field">
                <span className="label">Km to take off the boards</span>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </label>
              <label className="admin__check">
                <input type="checkbox" checked={probe} onChange={(e) => setProbe(e.target.checked)} />
                Also take km off the probe's distance (changes everyone's trip)
              </label>
              {probe && (
                <>
                  <label className="admin__field">
                    <span className="label">Km off the probe (their taps' push that day)</span>
                    <input inputMode="decimal" value={probeKm} onChange={(e) => setProbeKm(e.target.value)} required />
                  </label>
                  <p className="admin__note num">
                    The probe goes from {km(pv.probeKm)} km to {km(Math.max(0, pv.probeKm - (Number(probeKm) || 0)))} km. A game save state is
                    taken first.
                  </p>
                  <label className="admin__field">
                    <span className="label">Type {TAKE_OFF_PROBE_PHRASE}</span>
                    <input value={typed2} onChange={(e) => setTyped2(e.target.value)} autoComplete="off" spellCheck={false} />
                  </label>
                </>
              )}
            </>
          )}
        </>
      )}
      {(undo !== null || pv) && (
        <>
          <label className="admin__field">
            <span className="label">Reason (goes in the log)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, ADMIN_TEXT_MAX))} rows={2} required />
          </label>
          <label className="admin__field">
            <span className="label">
              Type <strong>{name}</strong> to confirm
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <PixelButton type="submit" variant="orange" disabled={busy || !ready}>
            {undo !== null ? "Put the km back" : probe ? "Remove from the boards and the probe" : "Remove from the boards"}
          </PixelButton>
        </>
      )}
      {msg && <p className="admin__note" role="status">{msg}</p>}
      {error && <p className="admin__error" role="alert">{error}</p>}
      {v.removals.length > 0 && (
        <ul className="admin__days">
          {v.removals.map((r) => (
            <li key={r.logId}>
              {when(r.at)} · {r.admin} · {r.day} · −{km(r.km)} km{r.probeKm > 0 ? ` · probe −${km(r.probeKm)} km` : ""}
              {r.reason ? ` · ${r.reason}` : ""}
              {r.undone ? (
                " · undone"
              ) : (
                <>
                  {" "}
                  <button type="button" className="admin__link" onClick={() => setUndo(r.logId)}>
                    Undo
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
