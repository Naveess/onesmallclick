import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ADMIN_TEXT_MAX, CONFIRM_FIXES, type AdminLogItem, type Fix, type FixKind, type PlayerDetail, type StatePart } from "../../../shared/admin";
import { BADGE_INFO, type BadgeId } from "../../../shared/badges";
import { stopName } from "../../../shared/campaign";
import { UPGRADES } from "../../../shared/upgrades";
import { PixelButton } from "../../components/PixelButton";
import { Window } from "../../components/Window";
import { int } from "../../game/format";

// Phase A1b-1: the player page's fixes, their save states, and Undo in their admin history. Every fix needs a reason
// and saves a save state first (the server does that); reset and delete, and every undo, ask for the name typed out.

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";

const FIXES: { id: FixKind | "export"; label: string; accountOnly?: boolean }[] = [
  { id: "set", label: "Set values" },
  { id: "reset", label: "Reset" },
  { id: "badge", label: "Badges" },
  { id: "crew", label: "Crew credit" },
  { id: "name", label: "Name" },
  { id: "country", label: "Country" },
  { id: "signout", label: "Sign out everywhere", accountOnly: true },
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
  const [kind, setKind] = useState<FixKind | "export">("set");
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
    const fix = fixFor();
    if (!fix) return;
    setBusy(true);
    setError("");
    setMsg("");
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

  const needName = CONFIRM_FIXES.includes(kind as FixKind);
  const list = FIXES.filter((f) => !f.accountOnly || p.kind === "account");
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
          {kind === "delete" && (
            <p className="admin__note">
              Deletes the account, the same way as their own "Delete account". The save state taken first, and the backups, age out within 90 days.
              This can't be undone from the log.
            </p>
          )}
          {!(kind === "crew" && p.arrivedLegs.length === 0) && (
            <Confirm
              name={p.profile.name}
              needName={needName}
              busy={busy}
              label={kind === "delete" ? "Delete the account" : "Apply the fix"}
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

/** Their save states (newest first). A1b-2 adds compare and restore. */
export function SaveStates({ p }: { p: PlayerDetail }) {
  return (
    <Window as="section" className="admin__card" aria-labelledby="pl-states">
      <h2 id="pl-states" className="admin__h2">
        Save states
      </h2>
      {p.snapshots.length === 0 ? (
        <p className="admin__note">None yet. One is taken before every fix.</p>
      ) : (
        <ul className="admin__days">
          {p.snapshots.map((s) => (
            <li key={s.id} className="num">
              {when(s.at)} · {s.reason}
              {s.admin ? ` · ${s.admin}` : ""} · {int(s.bytes)} bytes
            </li>
          ))}
        </ul>
      )}
      <p className="admin__note">Kept 90 days.</p>
    </Window>
  );
}

const partsOf = (l: AdminLogItem): StatePart[] => {
  try {
    const d = l.detail ? (JSON.parse(l.detail) as { snapshot?: number; parts?: StatePart[] }) : {};
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
          <p className="admin__note">Puts back: {parts.join(", ")}, as they were just before this change. A save state is taken first.</p>
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
