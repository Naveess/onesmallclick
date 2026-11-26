import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ADMIN_TEXT_MAX,
  CONFIRM_FIXES,
  diffStates,
  type AdminLogItem,
  type Fix,
  type FixKind,
  type PlayerDetail,
  type PlayerRow,
  type StateCompare,
  type StatePart,
} from "../../../shared/admin";
import { BADGE_INFO, type BadgeId } from "../../../shared/badges";
import { stopName } from "../../../shared/campaign";
import { UPGRADES } from "../../../shared/upgrades";
import { PixelButton } from "../../components/PixelButton";
import { Window } from "../../components/Window";

// Phase A1b-1: the player page's fixes, their save states, and Undo in their admin history. Every fix needs a reason
// and saves a save state first (the server does that); reset and delete, and every undo, ask for the name typed out.

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

type Kind = FixKind | "export" | "merge" | "move";

const FIXES: { id: Kind; label: string; accountOnly?: boolean; guestOnly?: boolean }[] = [
  { id: "set", label: "Set values" },
  { id: "reset", label: "Reset" },
  { id: "badge", label: "Badges" },
  { id: "crew", label: "Crew credit" },
  { id: "name", label: "Name" },
  { id: "country", label: "Country" },
  { id: "signout", label: "Sign out everywhere", accountOnly: true },
  { id: "merge", label: "Merge into an account", guestOnly: true },
  { id: "move", label: "Move a device", accountOnly: true },
  { id: "export", label: "Export (JSON)" },
  { id: "delete", label: "Delete account", accountOnly: true },
];

const RESET_PARTS: { id: Extract<Fix, { kind: "reset" }>["parts"][number]; label: string }[] = [
  { id: "credits", label: "Credits" },
  { id: "upgrades", label: "Upgrades" },
  { id: "prestige", label: "Patches (prestige)" },
  { id: "today", label: "Today's km and taps (leaderboard)" },
  { id: "badges", label: "Badges" },
  { id: "crew", label: "Crew credit for legs" },
];

function Check({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <label className="admin__check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** Find an account to merge into or move a device to (not this player). */
function AccountPicker({ self, picked, onPick }: { self: string; picked: PlayerRow | null; onPick: (r: PlayerRow | null) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const find = async () => {
    if (!q.trim()) return;
    const r = await fetch(`/api/admin/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
    const list = ((await r.json().catch(() => [])) as PlayerRow[]).filter((x) => x.kind === "account" && x.key !== self);
    setRows(list);
  };
  if (picked)
    return (
      <p className="admin__note">
        Into <strong>{picked.name}</strong>
        {picked.country ? ` (${picked.country})` : ""}{" "}
        <button type="button" className="admin__link" onClick={() => onPick(null)}>
          Change
        </button>
      </p>
    );
  return (
    <>
      <label className="admin__field">
        <span className="label">The account (name or email)</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void find();
            }
          }}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <PixelButton variant="outline" onClick={() => void find()}>
        Find
      </PixelButton>
      {rows && rows.length === 0 && <p className="admin__note">No account found.</p>}
      {rows && rows.length > 0 && (
        <div className="admin__row">
          {rows.slice(0, 8).map((r) => (
            <PixelButton key={r.key} variant="outline" onClick={() => onPick(r)}>
              {r.name}
            </PixelButton>
          ))}
        </div>
      )}
    </>
  );
}

/** Reason (and the typed name, when asked), then the button. */
function Confirm({ name, needName, busy, label, reason, setReason, typed, setTyped }: {
  name: string;
  needName: boolean;
  busy: boolean;
  label: string;
  reason: string;
  setReason: (s: string) => void;
  typed: string;
  setTyped: (s: string) => void;
}) {
  return (
    <>
      <label className="admin__field">
        <span className="label">Reason (goes in the log)</span>
        <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, ADMIN_TEXT_MAX))} rows={2} required />
      </label>
      {needName && (
        <label className="admin__field">
          <span className="label">
            Type <strong>{name}</strong> to confirm
          </span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
        </label>
      )}
      <PixelButton type="submit" variant={needName ? "orange" : "blue"} disabled={busy || !reason.trim() || (needName && typed !== name)}>
        {label}
      </PixelButton>
    </>
  );
}

export function Fixes({ p, onChanged, onGone }: { p: PlayerDetail; onChanged: () => void; onGone: () => void }) {
  const [kind, setKind] = useState<Kind>("set");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  // The forms' fields.
  const lv = p.progress?.levels ?? {};
  const [credits, setCredits] = useState(String(Math.floor(p.progress?.credits ?? 0)));
  const [levels, setLevels] = useState<Record<string, string>>(Object.fromEntries(UPGRADES.map((u) => [u.key, String(lv[u.key] ?? 0)])));
  const [patches, setPatches] = useState(String(p.progress?.patches ?? 0));
  const [parts, setParts] = useState<Set<string>>(new Set(["credits", "upgrades", "prestige", "today"]));
  const [badge, setBadge] = useState<string>("early-beta");
  const [leg, setLeg] = useState<number>(p.arrivedLegs[0]?.missionId ?? 0);
  const [legKm, setLegKm] = useState("0");
  const [name, setName] = useState("");
  const [lock, setLock] = useState(false);
  const [offers, setOffers] = useState<string[]>([]);
  const [country, setCountry] = useState(p.profile.country ?? "");
  const [clearCooldown, setClearCooldown] = useState(false);
  const [into, setInto] = useState<PlayerRow | null>(null);
  const [device, setDevice] = useState(p.devices[0]?.id ?? "");

  useEffect(() => {
    setMsg("");
    setError("");
    setTyped("");
    if (kind === "name" && offers.length === 0)
      void fetch("/api/admin/name-offers", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { offers?: string[] }) => setOffers(d.offers ?? []))
        .catch(() => {});
  }, [kind]);

  const has = new Set(p.badges.map((b) => b.badge));
  const crewed = new Set(p.legs.map((l) => l.missionId));
  const fixFor = (on = true): Fix | null => {
    switch (kind) {
      case "set": {
        const out: Record<string, number> = {};
        for (const u of UPGRADES) if (Number(levels[u.key]) !== (lv[u.key] ?? 0)) out[u.key] = Number(levels[u.key]);
        return {
          kind: "set",
          ...(Number(credits) !== Math.floor(p.progress?.credits ?? 0) ? { credits: Number(credits) } : {}),
          ...(Object.keys(out).length ? { levels: out } : {}),
          ...(Number(patches) !== (p.progress?.patches ?? 0) ? { patches: Number(patches) } : {}),
        };
      }
      case "reset":
        return { kind: "reset", parts: [...parts] as Extract<Fix, { kind: "reset" }>["parts"] };
      case "badge":
        return { kind: "badge", badge, on: !has.has(badge) };
      case "crew":
        return { kind: "crew", missionId: leg, on: !crewed.has(leg), km: Number(legKm) || 0 };
      case "name":
        return { kind: "name", name, lock };
      case "country":
        return { kind: "country", country: country || null, clearCooldown };
      case "signout":
        return { kind: "signout" };
      case "delete":
        return on ? { kind: "delete" } : null;
      default:
        return null;
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    if (kind === "merge" || kind === "move") {
      try {
        const body = kind === "merge" ? { key: p.key, into: into?.key, reason, confirm: typed } : { key: p.key, device, into: into?.key, reason, confirm: typed };
        await post(`/api/admin/${kind}`, body);
        setReason("");
        setTyped("");
        setMsg(kind === "merge" ? `Merged into ${into?.name}. Save states of both were taken first, and ${into?.name}'s log has Undo.` : "Moved. Save states were taken first, and the log has Undo.");
        onChanged();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
      return;
    }
    const fix = fixFor();
    if (!fix) return setBusy(false);
    try {
      const r = await post<{ snapshot: number; notes: string[]; gone: boolean }>("/api/admin/fix", { key: p.key, reason, confirm: typed, fix });
      setReason("");
      setTyped("");
      if (r.gone) return onGone();
      setMsg(["Done. A save state was taken first, and the log has Undo.", ...r.notes].join(" "));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const needName = CONFIRM_FIXES.includes(kind as FixKind) || kind === "merge" || kind === "move";
  const list = FIXES.filter((f) => (!f.accountOnly || p.kind === "account") && (!f.guestOnly || p.kind === "guest"));
  const blocked = (kind === "crew" && p.arrivedLegs.length === 0) || ((kind === "merge" || kind === "move") && !into) || (kind === "move" && !device);
  return (
    <Window as="section" className="admin__card" aria-labelledby="pl-fixes">
      <h2 id="pl-fixes" className="admin__h2">
        Fixes
      </h2>
      <div className="admin__row" role="group" aria-label="Which fix">
        {list.map((f) => (
          <PixelButton key={f.id} variant={kind === f.id ? "blue" : "outline"} onClick={() => setKind(f.id)} aria-pressed={kind === f.id}>
            {f.label}
          </PixelButton>
        ))}
      </div>

      {kind === "export" ? (
        <p className="admin__note">
          Everything about this player as a JSON file, for a subject access request. It's logged.{" "}
          <a className="admin__link" href={`/api/admin/export?key=${encodeURIComponent(p.key)}`} download>
            Download the file
          </a>
        </p>
      ) : (
        <form className="admin__fix" onSubmit={submit}>
          {kind === "set" && (
            <>
              <label className="admin__field">
                <span className="label">Credits</span>
                <input inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value.replace(/[^\d]/g, ""))} />
              </label>
              {UPGRADES.map((u) => (
                <label key={u.key} className="admin__field">
                  <span className="label">{u.name} level</span>
                  <input inputMode="numeric" value={levels[u.key]} onChange={(e) => setLevels({ ...levels, [u.key]: e.target.value.replace(/[^\d]/g, "") })} />
                </label>
              ))}
              <label className="admin__field">
                <span className="label">Patches (3 a handover)</span>
                <input inputMode="numeric" value={patches} onChange={(e) => setPatches(e.target.value.replace(/[^\d]/g, ""))} />
              </label>
              <p className="admin__note">Only the values you change are set.</p>
            </>
          )}
          {kind === "reset" && (
            <>
              <p className="admin__note">Reset to zero (or none):</p>
              {RESET_PARTS.map((r) => (
                <Check
                  key={r.id}
                  checked={parts.has(r.id)}
                  onChange={(on) => {
                    const next = new Set(parts);
                    if (on) next.add(r.id);
                    else next.delete(r.id);
                    setParts(next);
                  }}
                >
                  {r.label}
                </Check>
              ))}
            </>
          )}
          {kind === "badge" && (
            <>
              <label className="admin__field">
                <span className="label">Badge</span>
                <select value={badge} onChange={(e) => setBadge(e.target.value)}>
                  {(Object.keys(BADGE_INFO) as BadgeId[]).map((id) => (
                    <option key={id} value={id}>
                      {BADGE_INFO[id].name}
                      {has.has(id) ? " (has it)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <p className="admin__note">{has.has(badge) ? "This removes it." : "This gives it, earned now."}</p>
            </>
          )}
          {kind === "crew" &&
            (p.arrivedLegs.length === 0 ? (
              <p className="admin__note">No leg has arrived yet, so there's no crew credit to give.</p>
            ) : (
              <>
                <label className="admin__field">
                  <span className="label">Leg</span>
                  <select value={leg} onChange={(e) => setLeg(Number(e.target.value))}>
                    {p.arrivedLegs.map((l) => (
                      <option key={l.missionId} value={l.missionId}>
                        {l.stop ? stopName(l.stop) : `Mission ${l.missionId}`}
                        {crewed.has(l.missionId) ? " (crewed)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {!crewed.has(leg) && (
                  <label className="admin__field">
                    <span className="label">Km to credit them with (shown in the leg's credits)</span>
                    <input inputMode="numeric" value={legKm} onChange={(e) => setLegKm(e.target.value.replace(/[^\d]/g, ""))} />
                  </label>
                )}
                <p className="admin__note">{crewed.has(leg) ? "This removes their crew credit (and stamp) for the leg." : "This adds them to the leg's crew (and gives its stamp)."}</p>
              </>
            ))}
          {kind === "name" && (
            <>
              <div className="admin__row">
                {offers.map((o) => (
                  <PixelButton key={o} variant={name === o ? "blue" : "outline"} onClick={() => setName(o)}>
                    {o}
                  </PixelButton>
                ))}
              </div>
              <label className="admin__field">
                <span className="label">New name (pick one above, or type it)</span>
                <input value={name} onChange={(e) => setName(e.target.value.toLowerCase())} autoComplete="off" spellCheck={false} />
              </label>
              {p.kind === "account" && (
                <Check checked={lock} onChange={setLock}>
                  Lock it (they can't pick another)
                </Check>
              )}
            </>
          )}
          {kind === "country" && (
            <>
              <label className="admin__field">
                <span className="label">Country code (two letters, like GB)</span>
                <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))} autoComplete="off" />
              </label>
              {p.kind === "account" && (
                <Check checked={clearCooldown} onChange={setClearCooldown}>
                  Clear the cooldown (they can change it once more)
                </Check>
              )}
            </>
          )}
          {kind === "signout" && <p className="admin__note">Ends every signed-in browser. Their progress stays with the account.</p>}
          {kind === "merge" && (
            <>
              <p className="admin__note">
                For someone who played as this guest, then signed in on another browser. It merges like signing in: the higher level of each upgrade
                and the higher patch count, credits and km added, badges and crew credit combined. If this browser is used again, it starts as a fresh
                guest (they should sign in there). Undo is on the account's log.
              </p>
              <AccountPicker self={p.key} picked={into} onPick={setInto} />
            </>
          )}
          {kind === "move" &&
            (p.devices.length === 0 ? (
              <p className="admin__note">No device is signed in to this account.</p>
            ) : (
              <>
                <label className="admin__field">
                  <span className="label">Device</span>
                  <select value={device} onChange={(e) => setDevice(e.target.value)}>
                    {p.devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} · last seen {when(d.lastSeen)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="admin__note">
                  Moves this device's km by day, pings and votes to another account, and signs it out. Credits, upgrades, badges and crew credit stay
                  here: they belong to the account. Legs that have already arrived keep their crew lists.
                </p>
                <AccountPicker self={p.key} picked={into} onPick={setInto} />
              </>
            ))}
          {kind === "delete" && (
            <p className="admin__note">
              Deletes the account, the same way as their own "Delete account". The save state taken first, and the backups, age out within 90 days.
              This can't be undone from the log.
            </p>
          )}
          {!blocked && (
            <Confirm
              name={p.profile.name}
              needName={needName}
              busy={busy}
              label={kind === "delete" ? "Delete the account" : kind === "merge" ? "Merge" : kind === "move" ? "Move the device" : "Apply the fix"}
              reason={reason}
              setReason={setReason}
              typed={typed}
              setTyped={setTyped}
            />
          )}
        </form>
      )}
      {msg && <p className="admin__note" role="status">{msg}</p>}
      {error && <p className="admin__error" role="alert">{error}</p>}
    </Window>
  );
}

/** Their save states (newest first). Compare one with now, then restore the ticked parts. */
export function SaveStates({ p, onChanged }: { p: PlayerDetail; onChanged: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Window as="section" className="admin__card" aria-labelledby="pl-states">
      <h2 id="pl-states" className="admin__h2">
        Save states
      </h2>
      {p.snapshots.length === 0 ? (
        <p className="admin__note">None yet. One is taken before every fix, every day they play, and at big moments.</p>
      ) : (
        <ul className="admin__days">
          {p.snapshots.map((s) => (
            <li key={s.id} className="num">
              {when(s.at)} · {s.reason}
              {s.admin ? ` · ${s.admin}` : ""}{" "}
              {open !== s.id && (
                <button type="button" className="admin__link" onClick={() => setOpen(s.id)}>
                  Compare
                </button>
              )}
              {open === s.id && <Compare p={p} id={s.id} onClose={() => setOpen(null)} onChanged={onChanged} />}
            </li>
          ))}
        </ul>
      )}
      <p className="admin__note">Kept 90 days.</p>
    </Window>
  );
}

/** One save state against now, part by part, with a tick box on each part that differs. */
function Compare({ p, id, onClose, onChanged }: { p: PlayerDetail; id: number; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<StateCompare | null>(null);
  const [error, setError] = useState("");
  const [ticked, setTicked] = useState<Set<StatePart>>(new Set());
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    void fetch(`/api/admin/save-state?id=${id}&key=${encodeURIComponent(p.key)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error((d as { error?: string }).error ?? `Error ${r.status}`);
        setData(d as StateCompare);
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await post<{ notes: string[] }>("/api/admin/restore", { key: p.key, snapshot: id, parts: [...ticked], reason, confirm: typed });
      setMsg(["Restored. A save state was taken first, and the log has Undo.", ...r.notes].join(" "));
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (error && !data) return <p className="admin__error" role="alert">{error}</p>;
  if (!data) return <p className="admin__note">Loading…</p>;
  const changed = diffStates(data.then, data.now).filter((d) => d.changed);
  return (
    <form className="admin__fix" onSubmit={submit}>
      <p className="admin__note">The save state → now:</p>
      {changed.length === 0 && <p className="admin__note">Nothing differs: they're as they were.</p>}
      {changed.map((d) => (
        <div key={d.part}>
          <Check
            checked={ticked.has(d.part)}
            onChange={(on) => {
              const next = new Set(ticked);
              if (on) next.add(d.part);
              else next.delete(d.part);
              setTicked(next);
            }}
          >
            Restore: {d.label}
          </Check>
          <ul className="admin__days">
            {d.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ))}
      {changed.length > 0 && !msg && (
        <Confirm
          name={p.profile.name}
          needName
          busy={busy || ticked.size === 0}
          label="Restore the ticked parts"
          reason={reason}
          setReason={setReason}
          typed={typed}
          setTyped={setTyped}
        />
      )}
      <PixelButton variant="outline" onClick={onClose}>
        Close
      </PixelButton>
      {msg && <p className="admin__note" role="status">{msg}</p>}
      {error && <p className="admin__error" role="alert">{error}</p>}
    </form>
  );
}

const partsOf = (l: AdminLogItem): StatePart[] => {
  try {
    const d = l.detail ? (JSON.parse(l.detail) as { snapshot?: number; parts?: StatePart[] }) : {};
    if (d.snapshot && l.action === "move-device") return ["today"]; // the device's km history (Undo moves it back)
    return d.snapshot && d.parts?.length ? d.parts : [];
  } catch {
    return [];
  }
};

/** One line of their admin history, with Undo where the change saved a save state. */
export function LogLine({ l, name, onChanged }: { l: AdminLogItem; name: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parts = partsOf(l);
  const undo = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/admin/undo", { logId: l.id, reason, confirm: typed });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li>
      {when(l.at)} · {l.admin} · {l.action}
      {l.reason ? ` · ${l.reason}` : ""}
      {parts.length > 0 && !open && (
        <>
          {" "}
          <button type="button" className="admin__link" onClick={() => setOpen(true)}>
            Undo
          </button>
        </>
      )}
      {open && (
        <form className="admin__fix" onSubmit={undo}>
          <p className="admin__note">
            {l.action === "merge"
              ? "Puts both back as they were before the merge (the account's progress, badges and crew credit; the guest's too), and gives the device its history back. A save state is taken first."
              : l.action === "move-device"
                ? "Moves the device's km, pings and votes back to this account. The device stays signed out. A save state is taken first."
                : `Puts back: ${parts.join(", ")}, as they were just before this change. A save state is taken first.`}
          </p>
          <Confirm name={name} needName busy={busy} label="Undo this change" reason={reason} setReason={setReason} typed={typed} setTyped={setTyped} />
          <PixelButton variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </PixelButton>
          {error && <p className="admin__error" role="alert">{error}</p>}
        </form>
      )}
    </li>
  );
}
