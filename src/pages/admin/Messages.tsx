import { useEffect, useState, type FormEvent } from "react";
import { ADMIN_TEXT_MAX, type PlayerDetail, type PlayerRow } from "../../../shared/admin";
import { BADGE_INFO, type BadgeId } from "../../../shared/badges";
import {
  GIFT_CREDITS_MAX,
  MESSAGE_BODY_MAX,
  MESSAGE_TITLE_MAX,
  TAKE_GIFT_BACK_PHRASE,
  fillTemplate,
  type AdminMessage,
  type AdminMessagesView,
  type Gift,
  type GiftCollector,
} from "../../../shared/messages";
import { PixelButton } from "../../components/PixelButton";
import { Window } from "../../components/Window";

// Phase A2b-1 (decisions 39 and 40): messages from mission control. On a player's page, the Messages card (to them).
// The Messages tab (prompt 141): send to everyone (only players who existed when it's sent see it) or to one player
// (search for them), and every recent message with who it went to. A template fills the title and text, which can
// still be edited. A gift (credits or a badge) is paid when the player taps Collect, and has Undo: one player's is
// taken back (their name typed); an everyone gift can be taken back from one player who collected it ("Who collected
// it"), stopped for everyone else, or taken back from everyone (TAKE THE GIFT BACK typed). Withdraw hides a message
// from anyone who hasn't opened it.

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const n = (v: number) => v.toLocaleString("en-GB");
const players = (v: number) => `${n(v)} player${v === 1 ? "" : "s"}`;
const giftText = (g: Gift) => ("credits" in g ? `${n(g.credits)} credits` : `badge: ${BADGE_INFO[g.badge]?.name ?? g.badge}`);

type Target = { key: string; name: string };

/** The player page's card: messages to this player. */
export function PlayerMessages({ p }: { p: PlayerDetail }) {
  return <MessagesCard player={{ key: p.key, name: p.profile.name }} />;
}

/** The Messages tab: send to everyone or to one player; every recent message. */
export function MessagesTab() {
  return <MessagesCard player={null} />;
}

/** `player`: the player page's card (to them only). null: the Messages tab. */
function MessagesCard({ player }: { player: Target | null }) {
  const [v, setV] = useState<AdminMessagesView | null>(null);
  const [error, setError] = useState("");
  const path = `/api/admin/messages${player ? `?key=${encodeURIComponent(player.key)}` : ""}`;
  useEffect(() => {
    call<AdminMessagesView>(path).then(setV, (e: Error) => setError(e.message));
  }, [path]);
  const id = player ? "pl-messages" : "admin-messages-tab";
  return (
    <Window as="section" className="admin__card" aria-labelledby={id}>
      <h2 id={id} className="admin__h2">
        Messages
      </h2>
      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
      {v && (
        <>
          <Compose player={player} v={v} onSent={setV} />
          <h3 className="admin__h3">{player ? `Sent to ${player.name}` : "Sent recently"}</h3>
          <List tab={!player} items={v.messages} onDone={setV} />
        </>
      )}
    </Window>
  );
}

/** The tab's "one player": search by name, email, id or crew code, then pick. */
function PickPlayer({ picked, onPick }: { picked: Target | null; onPick: (t: Target | null) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [error, setError] = useState("");
  if (picked)
    return (
      <p className="admin__note">
        To <strong>{picked.name}</strong>{" "}
        <button type="button" className="admin__link" onClick={() => onPick(null)}>
          Change
        </button>
      </p>
    );
  const search = async () => {
    setError("");
    try {
      setRows(await call<PlayerRow[]>(`/api/admin/search?q=${encodeURIComponent(q.trim())}`));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="admin__fix">
      <label className="admin__field">
        <span className="label">Find the player (name, email, account or device id, crew code)</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (q.trim()) void search();
            }
          }}
        />
      </label>
      <PixelButton variant="outline" onClick={() => void search()} disabled={!q.trim()}>
        Search
      </PixelButton>
      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
      {rows && rows.length === 0 && <p className="admin__note">No one found.</p>}
      {rows && rows.length > 0 && (
        <ul className="admin__days">
          {rows.slice(0, 10).map((r) => (
            <li key={r.key} className="admin__pick">
              <button type="button" className="admin__link" onClick={() => onPick({ key: r.key, name: r.name })}>
                {r.name}
              </button>
              <span className="admin__note">
                {r.kind === "account" ? (r.email ?? "account") : "guest"}
                {r.country ? ` · ${r.country}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Compose({ player, v, onSent }: { player: Target | null; v: AdminMessagesView; onSent: (v: AdminMessagesView) => void }) {
  const [to, setTo] = useState<"everyone" | "one">(player ? "one" : "everyone");
  const [picked, setPicked] = useState<Target | null>(player);
  const [template, setTemplate] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [giftKind, setGiftKind] = useState<"none" | "credits" | "badge">("none");
  const [credits, setCredits] = useState("");
  const [badge, setBadge] = useState<BadgeId>(Object.keys(BADGE_INFO)[0] as BadgeId);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const target = to === "one" ? picked : null;
  const pick = (id: string) => {
    setTemplate(id);
    const t = v.templates.find((x) => x.id === id);
    if (!t) return;
    setTitle(fillTemplate(t.title, target?.name ?? null));
    setBody(fillTemplate(t.body, target?.name ?? null));
  };
  const creditsN = Number(credits);
  const gift: Gift | null = giftKind === "credits" ? { credits: creditsN } : giftKind === "badge" ? { badge } : null;
  const giftOk = giftKind !== "credits" || (Number.isInteger(creditsN) && creditsN >= 1 && creditsN <= GIFT_CREDITS_MAX);
  const ready = (to === "everyone" || !!target) && title.trim().length >= 2 && body.trim().length >= 2 && reason.trim().length >= 3 && giftOk;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      onSent(
        await call<AdminMessagesView>("/api/admin/message-send", {
          key: target?.key ?? null,
          title,
          body,
          template: template || undefined,
          gift,
          reason,
          view: player ? undefined : "all",
        }),
      );
      setDone(target ? `Sent to ${target.name}.` : "Sent to everyone.");
      setTemplate("");
      setTitle("");
      setBody("");
      setGiftKind("none");
      setCredits("");
      setReason("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="admin__fix" onSubmit={submit}>
      {!player && (
        <>
          <div className="admin__row" role="group" aria-label="Send to">
            <PixelButton variant={to === "everyone" ? "blue" : "outline"} aria-pressed={to === "everyone"} onClick={() => setTo("everyone")}>
              Everyone
            </PixelButton>
            <PixelButton variant={to === "one" ? "blue" : "outline"} aria-pressed={to === "one"} onClick={() => setTo("one")}>
              One player
            </PixelButton>
          </div>
          {to === "everyone" ? (
            <p className="admin__note">
              Shows in the inbox of every player who existed when it's sent (players who join later don't get it). Their screens pick it up the
              next time they open the game or come back to its tab.
            </p>
          ) : (
            <PickPlayer picked={picked} onPick={setPicked} />
          )}
        </>
      )}
      <label className="admin__field">
        <span className="label">Start from a template</span>
        <select value={template} onChange={(e) => pick(e.target.value)}>
          <option value="">None (write your own)</option>
          {v.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {!v.templatesApproved && <p className="admin__note">The templates' wording is a draft (content/messages.json) until you approve it.</p>}
      <label className="admin__field">
        <span className="label">Title</span>
        <input value={title} maxLength={MESSAGE_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} required />
      </label>
      <label className="admin__field">
        <span className="label">Message (what the player reads)</span>
        <textarea value={body} maxLength={MESSAGE_BODY_MAX} rows={5} onChange={(e) => setBody(e.target.value)} required />
      </label>
      <label className="admin__field">
        <span className="label">Gift (owner only)</span>
        <select value={giftKind} onChange={(e) => setGiftKind(e.target.value as typeof giftKind)}>
          <option value="none">No gift</option>
          <option value="credits">Credits</option>
          <option value="badge">A badge</option>
        </select>
      </label>
      {giftKind === "credits" && (
        <label className="admin__field">
          <span className="label">Credits (1 to {n(GIFT_CREDITS_MAX)})</span>
          <input inputMode="numeric" value={credits} onChange={(e) => setCredits(e.target.value.replace(/[^\d]/g, ""))} required />
        </label>
      )}
      {giftKind === "badge" && (
        <label className="admin__field">
          <span className="label">Badge</span>
          <select value={badge} onChange={(e) => setBadge(e.target.value as BadgeId)}>
            {(Object.keys(BADGE_INFO) as BadgeId[]).map((id) => (
              <option key={id} value={id}>
                {BADGE_INFO[id].name}
              </option>
            ))}
          </select>
        </label>
      )}
      {gift && (
        <p className="admin__note">
          Paid when {target ? "they tap" : "each player taps"} Collect in the inbox
          {target ? " (a save state is taken first)" : ", once per player"}. Paused and banned players collect it when that ends.
        </p>
      )}
      <label className="admin__field">
        <span className="label">Why (for the log; the player doesn't see this)</span>
        <input value={reason} maxLength={ADMIN_TEXT_MAX} onChange={(e) => setReason(e.target.value)} required />
      </label>
      <PixelButton type="submit" disabled={busy || !ready}>
        {busy ? "Sending…" : to === "everyone" ? "Send to everyone" : target ? `Send to ${target.name}` : "Pick a player first"}
      </PixelButton>
      {done && (
        <p className="admin__note" role="status">
          {done}
        </p>
      )}
      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function status(m: AdminMessage): string {
  const parts = [`${when(m.at)} · ${m.admin}`];
  if (m.gift) parts.push(`gift: ${giftText(m.gift)}`);
  if (m.toKey === null) {
    parts.push(`opened by ${players(m.reads)}`);
    if (m.gift) parts.push(`collected by ${players(m.collected)}${m.takenBack ? ` (taken back from ${players(m.takenBack)})` : ""}`);
  } else {
    parts.push(m.readAt ? `opened ${when(m.readAt)}` : "not opened yet");
    if (m.gift) {
      if (m.collectedAt) parts.push(`collected ${when(m.collectedAt)}${m.collectedCredits ? ` (${n(m.collectedCredits)} credits)` : ""}`);
      if (m.takenBackAt) parts.push(`taken back ${when(m.takenBackAt)}${m.takenBackCredits !== null ? ` (${n(m.takenBackCredits)} credits)` : ""}`);
    }
  }
  if (m.withdrawnAt) parts.push(`withdrawn ${when(m.withdrawnAt)} by ${m.withdrawnBy}`);
  else if (m.giftStoppedAt) parts.push(`gift stopped ${when(m.giftStoppedAt)}`);
  return parts.join(" · ");
}

type Acting = { id: number; kind: "withdraw" | "undo" | "who" };

function List({ tab, items, onDone }: { tab: boolean; items: AdminMessage[]; onDone: (v: AdminMessagesView) => void }) {
  const [acting, setActing] = useState<Acting | null>(null);
  if (items.length === 0) return <p className="admin__note">No messages yet.</p>;
  return (
    <ul className="admin__msgs">
      {items.map((m) => {
        const everyone = m.toKey === null;
        const canUndo = !!m.gift && (everyone ? !m.giftStoppedAt || m.collected > m.takenBack : !m.takenBackAt && (!!m.collectedAt || !m.giftStoppedAt));
        const done = (v: AdminMessagesView) => {
          setActing(null);
          onDone(v);
        };
        return (
          <li key={m.id} className="admin__msg">
            {tab && <span className="admin__msg-to">{everyone ? "To everyone" : `To ${m.toName ?? "a deleted player"}`}</span>}
            <strong>{m.title}</strong>
            <span className="admin__mod-reason">“{m.body}”</span>
            <span>{status(m)}</span>
            <span className="admin__note">Why: {m.reason}</span>
            {acting?.id !== m.id ? (
              <span className="admin__row">
                {!m.withdrawnAt && (
                  <button type="button" className="admin__link" onClick={() => setActing({ id: m.id, kind: "withdraw" })}>
                    Withdraw
                  </button>
                )}
                {everyone && m.gift && m.collected > 0 && (
                  <button type="button" className="admin__link" onClick={() => setActing({ id: m.id, kind: "who" })}>
                    Who collected it
                  </button>
                )}
                {canUndo && (
                  <button type="button" className="admin__link" onClick={() => setActing({ id: m.id, kind: "undo" })}>
                    {everyone ? "Undo the gift for everyone" : "Undo the gift"}
                  </button>
                )}
              </span>
            ) : acting.kind === "who" ? (
              <Collectors m={m} tab={tab} onClose={() => setActing(null)} onDone={done} />
            ) : (
              <Act m={m} tab={tab} kind={acting.kind} onCancel={() => setActing(null)} onDone={done} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** An everyone gift: who collected it, each with "Take it back from them" (their name typed; the gift stays open). */
function Collectors({ m, tab, onClose, onDone }: { m: AdminMessage; tab: boolean; onClose: () => void; onDone: (v: AdminMessagesView) => void }) {
  const [rows, setRows] = useState<GiftCollector[] | null>(null);
  const [error, setError] = useState("");
  const [taking, setTaking] = useState<GiftCollector | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call<GiftCollector[]>(`/api/admin/message-collectors?id=${m.id}`).then(setRows, (e: Error) => setError(e.message));
  }, [m.id]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!taking) return;
    setBusy(true);
    setError("");
    try {
      onDone(await call<AdminMessagesView>("/api/admin/gift-undo", { id: m.id, playerKey: taking.key, reason, confirm, view: tab ? "all" : undefined }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="admin__fix">
      {rows === null && !error && <p className="admin__note">Loading…</p>}
      {rows && (
        <ul className="admin__days">
          {rows.map((c) => (
            <li key={c.key} className="admin__pick">
              <span>
                <strong>{c.name ?? "a deleted player"}</strong> · collected {when(c.collectedAt)}
                {c.credits ? ` · ${n(c.credits)} credits` : ""}
                {c.takenBackAt ? ` · taken back ${when(c.takenBackAt)}${c.takenBackCredits !== null ? ` (${n(c.takenBackCredits)} credits)` : ""}` : ""}
              </span>
              {!c.takenBackAt && taking?.key !== c.key && (
                <button
                  type="button"
                  className="admin__link"
                  onClick={() => {
                    setTaking(c);
                    setConfirm("");
                  }}
                >
                  Take it back from them
                </button>
              )}
              {taking?.key === c.key && (
                <form className="admin__fix" onSubmit={submit}>
                  <p className="admin__note">
                    Takes the gift back from {c.name} only (credits as far as they still have them; a badge only if it was new to them). A save
                    state is taken first. Everyone else keeps theirs, and it stays open to collect.
                  </p>
                  <label className="admin__field">
                    <span className="label">Why (for the log)</span>
                    <input value={reason} maxLength={ADMIN_TEXT_MAX} onChange={(e) => setReason(e.target.value)} required />
                  </label>
                  <label className="admin__field">
                    <span className="label">Type their name ({c.name}) to confirm</span>
                    <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required />
                  </label>
                  <span className="admin__row">
                    <PixelButton type="submit" disabled={busy || reason.trim().length < 3 || confirm !== c.name}>
                      Take it back
                    </PixelButton>
                    <button type="button" className="admin__link" onClick={() => setTaking(null)}>
                      Cancel
                    </button>
                  </span>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="admin__link" onClick={onClose}>
        Close the list
      </button>
    </div>
  );
}

function Act({
  m,
  tab,
  kind,
  onCancel,
  onDone,
}: {
  m: AdminMessage;
  tab: boolean;
  kind: "withdraw" | "undo";
  onCancel: () => void;
  onDone: (v: AdminMessagesView) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [takeBack, setTakeBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const everyone = m.toKey === null;
  const name = m.toName ?? "";
  // One player who collected: taken back, their name typed. Everyone: stopping is one step; taking back asks for the phrase.
  const needName = kind === "undo" && !everyone && !!m.collectedAt;
  const needPhrase = kind === "undo" && everyone && takeBack;
  const left = m.collected - m.takenBack;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const view = tab ? "all" : undefined;
      const r =
        kind === "withdraw"
          ? await call<AdminMessagesView>("/api/admin/message-withdraw", { id: m.id, reason, view })
          : await call<AdminMessagesView>("/api/admin/gift-undo", { id: m.id, reason, confirm: confirm || undefined, takeBack: everyone ? takeBack : undefined, view });
      onDone(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="admin__fix" onSubmit={submit}>
      <p className="admin__note">
        {kind === "withdraw"
          ? "Hides it from anyone who hasn't opened it, and its gift can't be collected any more. Collected gifts stay (use Undo the gift for those)."
          : !everyone
            ? m.collectedAt
              ? `Takes the gift back from ${name} (credits only as far as they still have them; a badge only if it was new to them). A save state is taken first.`
              : `${name} hasn't collected it: this stops it being collected.`
            : "Stops anyone else collecting it. To take it back from one player only, use \"Who collected it\" instead."}
      </p>
      {kind === "undo" && everyone && left > 0 && (
        <label className="admin__check">
          <input type="checkbox" checked={takeBack} onChange={(e) => setTakeBack(e.target.checked)} />
          <span>Also take it back from all {players(left)} who collected it (a game save state is taken first)</span>
        </label>
      )}
      <label className="admin__field">
        <span className="label">Why (for the log)</span>
        <input value={reason} maxLength={ADMIN_TEXT_MAX} onChange={(e) => setReason(e.target.value)} required />
      </label>
      {(needName || needPhrase) && (
        <label className="admin__field">
          <span className="label">{needName ? `Type their name (${name}) to confirm` : `Type ${TAKE_GIFT_BACK_PHRASE} to confirm`}</span>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" required />
        </label>
      )}
      <span className="admin__row">
        <PixelButton type="submit" disabled={busy || reason.trim().length < 3}>
          {kind === "withdraw" ? "Withdraw the message" : needName || needPhrase ? "Take the gift back" : "Stop the gift"}
        </PixelButton>
        <button type="button" className="admin__link" onClick={onCancel}>
          Cancel
        </button>
      </span>
      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
