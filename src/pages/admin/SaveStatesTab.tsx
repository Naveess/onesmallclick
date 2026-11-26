import { useEffect, useState, type FormEvent } from "react";
import { ADMIN_TEXT_MAX, GAME_RESTORE_PHRASE, diffGame, summarizeGame, type GameCompare, type GameStatesList, type SnapshotItem } from "../../../shared/admin";
import { PixelButton } from "../../components/PixelButton";
import { Window } from "../../components/Window";
import { int } from "../../game/format";

// Phase A1c-1: the Save states tab. The game's save states (hourly, daily, before every Game-tab control, when a new
// version starts, by hand), compare one with now, and restore the probe from one (players untouched). Plus the group
// files of player save states (daily, a leg's arrival); one player's are on their page in Players.

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

type Filter = "all" | "hourly" | "other";

export function SaveStatesTab() {
  const [data, setData] = useState<GameStatesList | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("other");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () =>
    void fetch("/api/admin/game-states", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error ?? `Error ${r.status}`);
        setData(d as GameStatesList);
      })
      .catch((err: Error) => setError(err.message));
  useEffect(load, []);

  const takeNow = async () => {
    setBusy(true);
    setMsg("");
    try {
      await post("/api/admin/game-save", { reason: "by hand" });
      setMsg("Taken.");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <p className="admin__error" role="alert">{error}</p>;
  if (!data) return <p className="admin__note">Loading…</p>;
  const hourly = (s: SnapshotItem) => s.reason === "hourly";
  const shown = data.game.filter((s) => filter === "all" || (filter === "hourly" ? hourly(s) : !hourly(s)));
  return (
    <>
      <p className="admin__lede">The game's save states: the probe, the leg, the clock, the signal, the vote and the landing burn. Players' own save states are on their pages.</p>
      <Window as="section" className="admin__card" aria-labelledby="saves-game">
        <h2 id="saves-game" className="admin__h2">
          Game save states
        </h2>
        <p className="admin__note">
          Taken every hour (kept 7 days), every day at 00:05 UTC, before every Game-tab control, when a new version starts, and before a restore (kept 90 days).
        </p>
        <div className="admin__row" role="group" aria-label="Which save states">
          {(
            [
              ["other", "Daily and before changes"],
              ["hourly", "Hourly"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <PixelButton key={id} variant={filter === id ? "blue" : "outline"} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </PixelButton>
          ))}
        </div>
        <PixelButton variant="outline" disabled={busy} onClick={() => void takeNow()}>
          Take one now
        </PixelButton>
        {msg && <p className="admin__note" role="status">{msg}</p>}
        {shown.length === 0 ? (
          <p className="admin__note">None yet.</p>
        ) : (
          <ul className="admin__days">
            {shown.map((s) => (
              <li key={s.id} className="num">
                {when(s.at)} · {s.reason}
                {s.admin ? ` · ${s.admin}` : ""}{" "}
                {open !== s.id && (
                  <button type="button" className="admin__link" onClick={() => setOpen(s.id)}>
                    Compare
                  </button>
                )}
                {open === s.id && <GameCompareView id={s.id} onClose={() => setOpen(null)} onRestored={load} />}
              </li>
            ))}
          </ul>
        )}
      </Window>

      {data.restores.length > 0 && (
        <Window as="section" className="admin__card" aria-labelledby="saves-restores">
          <h2 id="saves-restores" className="admin__h2">
            Restores
          </h2>
          <p className="admin__note">To undo a restore, restore the save state taken just before it ("before restore" above).</p>
          <ul className="admin__days">
            {data.restores.map((l) => {
              const d = (() => {
                try {
                  return JSON.parse(l.detail ?? "{}") as { fromAt?: number; snapshot?: number };
                } catch {
                  return {};
                }
              })();
              return (
                <li key={l.id}>
                  {when(l.at)} · {l.admin} · back to {d.fromAt ? when(d.fromAt) : "?"}
                  {l.reason ? ` · ${l.reason}` : ""}{" "}
                  {d.snapshot && open !== d.snapshot && (
                    <button type="button" className="admin__link" onClick={() => setOpen(d.snapshot!)}>
                      Undo (compare first)
                    </button>
                  )}
                  {d.snapshot && open === d.snapshot && <GameCompareView id={d.snapshot} onClose={() => setOpen(null)} onRestored={load} />}
                </li>
              );
            })}
          </ul>
        </Window>
      )}

      <Window as="section" className="admin__card" aria-labelledby="saves-groups">
        <h2 id="saves-groups" className="admin__h2">
          Player save states (whole days and arrivals)
        </h2>
        <p className="admin__note">One file for everyone who played that day, or crewed that leg. Open a player in Players to compare or restore theirs.</p>
        {data.groups.length === 0 ? (
          <p className="admin__note">None yet. The first daily one is taken at 00:05 UTC.</p>
        ) : (
          <ul className="admin__days">
            {data.groups.map((g) => (
              <li key={g.file} className="num">
                {when(g.at)} · {g.reason} · {int(g.players)} {g.players === 1 ? "player" : "players"}
              </li>
            ))}
          </ul>
        )}
      </Window>
    </>
  );
}

/** One game save state against now, then restore it (reason and the phrase typed out). */
function GameCompareView({ id, onClose, onRestored }: { id: number; onClose: () => void; onRestored: () => void }) {
  const [data, setData] = useState<GameCompare | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    void fetch(`/api/admin/game-state?id=${id}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error ?? `Error ${r.status}`);
        setData(d as GameCompare);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/admin/game-restore", { snapshot: id, reason, confirm: typed });
      setMsg("Restored. The probe restarted on it, and every open screen reconnected. A save state was taken first.");
      onRestored();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (error && !data) return <p className="admin__error" role="alert">{error}</p>;
  if (!data) return <p className="admin__note">Loading…</p>;
  const lines = diffGame(data.then, data.now);
  const a = summarizeGame(data.then);
  const b = summarizeGame(data.now);
  return (
    <form className="admin__fix" onSubmit={submit}>
      <p className="admin__note">The save state → now:</p>
      {lines.length === 0 ? (
        <p className="admin__note">Nothing that matters differs.</p>
      ) : (
        <ul className="admin__days">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {a.missionId !== b.missionId && (
        <p className="admin__error">
          This goes back to a different leg. The database's record of legs (credits, crew lists, stamps) isn't changed by a restore: check the runbook first.
        </p>
      )}
      {!msg && (
        <>
          <p className="admin__note">Restoring puts the probe back as it was then. Players' progress, badges and km stay as they are now.</p>
          <label className="admin__field">
            <span className="label">Reason (goes in the log)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, ADMIN_TEXT_MAX))} rows={2} required />
          </label>
          <label className="admin__field">
            <span className="label">
              Type <strong>{GAME_RESTORE_PHRASE}</strong> to confirm
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
          <PixelButton type="submit" variant="orange" disabled={busy || !reason.trim() || typed !== GAME_RESTORE_PHRASE}>
            Restore the probe
          </PixelButton>
        </>
      )}
      <PixelButton variant="outline" onClick={onClose}>
        Close
      </PixelButton>
      {msg && <p className="admin__note" role="status">{msg}</p>}
      {error && <p className="admin__error" role="alert">{error}</p>}
    </form>
  );
}
