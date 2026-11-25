import { useEffect, useState, type FormEvent } from "react";
import { ADMIN_TEXT_MAX, PLAYER_LISTS, type PlayerDetail, type PlayerList, type PlayerRow } from "../../../shared/admin";
import { stopName } from "../../../shared/campaign";
import { PixelButton } from "../../components/PixelButton";
import { Window } from "../../components/Window";
import { int } from "../../game/format";

// Phase A1a: the Players tab. Find anyone (search, or a list), then one screen with everything about them, and
// private notes. Read only for now: A1b adds the fixes and save states.

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

const when = (ms: number | null) => (ms ? new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "never");
const ago = (ms: number | null) => {
  if (!ms) return "never";
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const mask = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, "$1•••$2");

/** An email, masked until tapped (it's personal data: shown only when needed). */
function Email({ email }: { email: string }) {
  const [shown, setShown] = useState(false);
  return (
    <button type="button" className="admin__link" onClick={() => setShown(!shown)} aria-label={shown ? "Hide email" : "Show email"}>
      {shown ? email : mask(email)}
    </button>
  );
}

function Results({ rows, onOpen }: { rows: PlayerRow[]; onOpen: (key: string) => void }) {
  if (rows.length === 0) return <p className="admin__note">Nobody found.</p>;
  return (
    <ul className="admin__players">
      {rows.map((r) => (
        <li key={r.key}>
          <button type="button" className="admin__player" onClick={() => onOpen(r.key)}>
            <span className="admin__player-name">
              {r.name}
              {r.country ? ` · ${r.country}` : ""}
              {r.kind === "guest" ? " · guest" : r.google ? " · Google" : " · email"}
            </span>
            <span className="admin__player-meta num">
              today {int(r.kmToday)} km, {int(r.tapsToday)} taps · seen {ago(r.lastSeen)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The last 30 days as small bars (km), with the taps and pings in the title of each. */
function DayBars({ days }: { days: PlayerDetail["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.km));
  const list = [...days].reverse();
  return (
    <div className="admin__bars" role="img" aria-label={`km a day, last ${days.length} days with play`}>
      {list.map((d) => (
        <span
          key={d.day}
          className={d.pinged ? "admin__bar admin__bar--ping" : "admin__bar"}
          style={{ height: `${Math.max(4, Math.round((d.km / max) * 60))}px` }}
          title={`${d.day}: ${int(d.km)} km, ${int(d.taps)} taps${d.pinged ? ", pinged" : ""}`}
        />
      ))}
    </div>
  );
}

function Player({ playerKey, onBack, onOpen }: { playerKey: string; onBack: () => void; onOpen: (key: string) => void }) {
  const [p, setP] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setP(null);
    setError("");
    get<PlayerDetail>(`/api/admin/player?key=${encodeURIComponent(playerKey)}`).then(setP, (e: Error) => setError(e.message));
  }, [playerKey]);

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: playerKey, text: note }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setP(data as PlayerDetail);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p className="admin__error">{error}</p>;
  if (!p) return <p className="admin__note">Loading…</p>;
  const pr = p.profile;
  const tapsDay = p.days.reduce((m, d) => Math.max(m, d.taps), 0);
  return (
    <>
      <div className="admin__row">
        <PixelButton variant="outline" onClick={onBack}>
          ← Back to the list
        </PixelButton>
      </div>

      <Window as="section" className="admin__card" aria-labelledby="pl-name">
        <h2 id="pl-name" className="admin__h2">
          {pr.name}
          {pr.country ? ` · ${pr.country}` : ""}
        </h2>
        <dl className="admin__stats">
          <div>
            <dt>Kind</dt>
            <dd>
              {p.kind === "guest" ? "Guest (no account)" : pr.google ? "Account · Google" : "Account · email link"}
              {pr.nameChosen === false ? " · name not chosen yet" : ""}
            </dd>
          </div>
          {pr.email && (
            <div>
              <dt>Email</dt>
              <dd>
                <Email email={pr.email} />
              </dd>
            </div>
          )}
          <div>
            <dt>Joined · last seen</dt>
            <dd className="num">
              {when(pr.createdAt)} · {ago(pr.lastSeen)}
            </dd>
          </div>
          {pr.countryChangedAt && (
            <div>
              <dt>Country changed</dt>
              <dd className="num">{when(pr.countryChangedAt)}</dd>
            </div>
          )}
          <div>
            <dt>Came from</dt>
            <dd>
              {pr.signupSource ? `sign-in nudge: ${pr.signupSource}` : "—"}
              {pr.recruitedBy && (
                <>
                  {" · recruited by "}
                  <button type="button" className="admin__link" onClick={() => onOpen(pr.recruitedBy!.key)}>
                    {pr.recruitedBy.name ?? pr.recruitedBy.key}
                  </button>{" "}
                  ({pr.recruitedBy.moment} via {pr.recruitedBy.channel})
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Crew link · recruits · alerts</dt>
            <dd className="num">
              {pr.crewCode ? `/c/${pr.crewCode}` : "none"} · {pr.recruits.recruits} of {pr.recruits.arrived} arrived · {pr.alerts ? "alerts on" : "no alerts"}
            </dd>
          </div>
          <div>
            <dt>Key</dt>
            <dd className="admin__mono">{p.key}</dd>
          </div>
        </dl>
      </Window>

      <Window as="section" className="admin__card" aria-labelledby="pl-progress">
        <h2 id="pl-progress" className="admin__h2">
          Progress
        </h2>
        {p.progress ? (
          <dl className="admin__stats">
            <div>
              <dt>Credits</dt>
              <dd className="num">{int(p.progress.credits)} cr</dd>
            </div>
            <div>
              <dt>Upgrades</dt>
              <dd className="num">
                {Object.entries(p.progress.levels)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(" · ")}
              </dd>
            </div>
            <div>
              <dt>Patches (handovers)</dt>
              <dd className="num">
                {p.progress.patches} ({p.progress.patches / 3}) · {int(p.progress.kmSinceShift)} km toward the next
              </dd>
            </div>
            <div>
              <dt>Saved</dt>
              <dd className="num">{when(p.progress.savedAt)}</dd>
            </div>
          </dl>
        ) : (
          <p className="admin__note">No saved progress yet.</p>
        )}
      </Window>

      <Window as="section" className="admin__card" aria-labelledby="pl-activity">
        <h2 id="pl-activity" className="admin__h2">
          Activity
        </h2>
        <dl className="admin__stats">
          <div>
            <dt>All time</dt>
            <dd className="num">
              {int(p.totals.km)} km · {int(p.totals.taps)} taps · {p.totals.pings} pings · {p.totals.votes} votes · {p.totals.feedback} reports
            </dd>
          </div>
          <div>
            <dt>Busiest day (last 30)</dt>
            <dd className="num">
              {int(tapsDay)} taps{tapsDay > 15 * 3600 * 2 ? " · over 2 hours at the 15-a-second cap" : ""}
            </dd>
          </div>
        </dl>
        {p.days.length > 0 && <DayBars days={p.days} />}
        <ul className="admin__days">
          {p.days.slice(0, 10).map((d) => (
            <li key={d.day} className="num">
              {d.day}: {int(d.km)} km · {int(d.taps)} taps{d.pinged ? " · pinged" : ""}
            </li>
          ))}
        </ul>
      </Window>

      <Window as="section" className="admin__card" aria-labelledby="pl-rewards">
        <h2 id="pl-rewards" className="admin__h2">
          Rewards
        </h2>
        <p className="admin__note">
          {p.badges.length ? p.badges.map((b) => `${b.name} (${when(b.at).slice(0, 10)})`).join(" · ") : "No badges yet."}
        </p>
        <p className="admin__note">
          {p.legs.length
            ? p.legs.map((l) => `${l.stop ? stopName(l.stop) : `mission ${l.missionId}`}${l.medal ? ` ${l.medal}` : ""}: ${int(l.km)} km`).join(" · ")
            : "No legs crewed to arrival yet."}
        </p>
      </Window>

      <Window as="section" className="admin__card" aria-labelledby="pl-devices">
        <h2 id="pl-devices" className="admin__h2">
          Devices and sessions
        </h2>
        <ul className="admin__days">
          {p.devices.map((d) => (
            <li key={d.id}>
              <span className="admin__mono">{d.id.slice(0, 8)}</span> {d.name}
              {d.country ? ` · ${d.country}` : ""} · first {when(d.createdAt).slice(0, 10)} · last {ago(d.lastSeen)}
            </li>
          ))}
        </ul>
        {p.kind === "account" && (
          <p className="admin__note">
            {p.sessions.count} signed-in browser{p.sessions.count === 1 ? "" : "s"}
            {p.sessions.lastCreated ? `, the newest from ${when(p.sessions.lastCreated)}` : ""}.
          </p>
        )}
      </Window>

      <Window as="form" className="admin__card" aria-labelledby="pl-notes" onSubmit={addNote}>
        <h2 id="pl-notes" className="admin__h2">
          Notes and history
        </h2>
        <label className="admin__field">
          <span className="label">Add a private note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, ADMIN_TEXT_MAX))} rows={2} />
        </label>
        <PixelButton type="submit" disabled={busy || !note.trim()}>
          Save note
        </PixelButton>
        {p.notes.map((n) => (
          <p key={n.id} className="admin__note">
            <strong>{when(n.at)}</strong> · {n.admin}: {n.text}
          </p>
        ))}
        {p.log.length > 0 && (
          <ul className="admin__days">
            {p.log.map((l) => (
              <li key={l.id}>
                {when(l.at)} · {l.admin} · {l.action}
                {l.reason ? ` · ${l.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
        {p.notes.length === 0 && p.log.length === 0 && <p className="admin__note">No notes or admin changes yet.</p>}
      </Window>
    </>
  );
}

/** The Players tab: search or a list, then one player. */
export function PlayersTab() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<PlayerList>("active");
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async (path: string) => {
    setError("");
    setRows(null);
    try {
      setRows(await get<PlayerRow[]>(path));
    } catch (err) {
      setError((err as Error).message);
      setRows([]);
    }
  };
  useEffect(() => {
    if (!q) void load(`/api/admin/search?list=${list}`);
  }, [list]);

  if (open) return <Player playerKey={open} onBack={() => setOpen(null)} onOpen={setOpen} />;
  return (
    <Window as="section" className="admin__card" aria-labelledby="admin-players-tab">
      <h2 id="admin-players-tab" className="admin__h2">
        Find a player
      </h2>
      <form
        className="admin__search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) void load(`/api/admin/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label className="admin__field">
          <span className="label">Name, email, account or device id, crew code, or country (GB)</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
        <PixelButton type="submit" disabled={!q.trim()}>
          Search
        </PixelButton>
      </form>
      <div className="admin__row">
        {PLAYER_LISTS.map((l) => (
          <PixelButton
            key={l.id}
            variant={!q && list === l.id ? "blue" : "outline"}
            onClick={() => {
              setQ("");
              if (list === l.id) void load(`/api/admin/search?list=${l.id}`);
              else setList(l.id);
            }}
          >
            {l.label}
          </PixelButton>
        ))}
      </div>
      {error && <p className="admin__error">{error}</p>}
      {rows === null ? <p className="admin__note">Loading…</p> : <Results rows={rows} onOpen={setOpen} />}
    </Window>
  );
}
