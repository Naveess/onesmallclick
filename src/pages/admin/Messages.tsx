import { useEffect, useState, type FormEvent } from "react";
import { ADMIN_TEXT_MAX, type PlayerDetail } from "../../../shared/admin";
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
} from "../../../shared/messages";
import { PixelButton } from "../../components/PixelButton";
import { Window } from "../../components/Window";

// Phase A2b-1 (decisions 39 and 40): messages from mission control. On a player's page, the Messages card (to them);
// the Messages tab, to everyone (only players who existed when it's sent see it). A template fills the title and text,
// which can still be edited. A gift (credits or a badge) is paid when the player taps Collect, and has Undo: one
// player's is taken back (their name typed); an everyone gift stops, and can be taken back from everyone who collected
// it (TAKE THE GIFT BACK typed). Withdraw hides a message from anyone who hasn't opened it.

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}

const when = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const n = (v: number) => v.toLocaleString("en-GB");
const giftText = (g: Gift) => ("credits" in g ? `${n(g.credits)} credits` : `badge: ${BADGE_INFO[g.badge]?.name ?? g.badge}`);

type Target = { key: string; name: string } | null;

/** The player page's card. */
export function PlayerMessages({ p }: { p: PlayerDetail }) {
  return <MessagesCard target={{ key: p.key, name: p.profile.name }} />;
}

/** The Messages tab: to everyone. */
export function MessagesTab() {
  return <MessagesCard target={null} />;
}

function MessagesCard({ target }: { target: Target }) {
  const [v, setV] = useState<AdminMessagesView | null>(null);
  const [error, setError] = useState("");
  const path = `/api/admin/messages${target ? `?key=${encodeURIComponent(target.key)}` : ""}`;
  useEffect(() => {
    call<AdminMessagesView>(path).then(setV, (e: Error) => setError(e.message));
  }, [path]);
  const id = target ? "pl-messages" : "admin-messages-tab";
  return (
    <Window as="section" className="admin__card" aria-labelledby={id}>
      <h2 id={id} className="admin__h2">
        {target ? "Messages" : "Messages to everyone"}
      </h2>
      {!target && (
        <p className="admin__note">
          Shows in the inbox of every player who existed when it was sent (new players after that don't get it). Their screens pick it up
          the next time they open the game or come back to its tab.
        </p>
      )}
      {error && (
        <p className="admin__error" role="alert">
          {error}
        </p>
      )}
      {v && (
        <>
          <Compose target={target} v={v} onSent={setV} />
          <List target={target} items={v.messages} onDone={setV} />
        </>
      )}
    </Window>
  );
}

function Compose({ target, v, onSent }: { target: Target; v: AdminMessagesView; onSent: (v: AdminMessagesView) => void }) {
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    try {
      onSent(await call<AdminMessagesView>("/api/admin/message-send", { key: target?.key ?? null, title, body, template: template || undefined, gift, reason }));
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
      <PixelButton type="submit" disabled={busy || title.trim().length < 2 || body.trim().length < 2 || reason.trim().length < 3 || !giftOk}>
        {busy ? "Sending…" : target ? `Send to ${target.name}` : "Send to everyone"}
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

function status(m: AdminMessage, everyone: boolean): string {
  const parts = [`${when(m.at)} · ${m.admin}`];
  if (m.gift) parts.push(`gift: ${giftText(m.gift)}`);
  if (everyone) {
    parts.push(`opened by ${n(m.reads)}`);
    if (m.gift) parts.push(`collected by ${n(m.collected)}${m.takenBack ? ` (taken back from ${n(m.takenBack)})` : ""}`);
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

function List({ target, items, onDone }: { target: Target; items: AdminMessage[]; onDone: (v: AdminMessagesView) => void }) {
  const [acting, setActing] = useState<{ id: number; kind: "withdraw" | "undo" } | null>(null);
  if (items.length === 0) return <p className="admin__note">{target ? "No messages to this player yet." : "No messages to everyone yet."}</p>;
  return (
    <ul className="admin__days">
      {items.map((m) => {
        const canUndo = !!m.gift && !m.takenBackAt && (target ? !!m.collectedAt || !m.giftStoppedAt : !m.giftStoppedAt || m.collected > m.takenBack);
        return (
          <li key={m.id} className="admin__mod">
            <span>
              <strong>{m.title}</strong>
            </span>
            <span className="admin__mod-reason">“{m.body}”</span>
            <span>{status(m, !target)}</span>
            <span className="admin__note">Why: {m.reason}</span>
            {acting?.id !== m.id && (
              <span className="admin__row">
                {!m.withdrawnAt && (
                  <button type="button" className="admin__link" onClick={() => setActing({ id: m.id, kind: "withdraw" })}>
                    Withdraw
                  </button>
                )}
                {canUndo && (
                  <button type="button" className="admin__link" onClick={() => setActing({ id: m.id, kind: "undo" })}>
                    Undo the gift
                  </button>
                )}
              </span>
            )}
            {acting?.id === m.id && <Act m={m} target={target} kind={acting.kind} onCancel={() => setActing(null)} onDone={(v) => (setActing(null), onDone(v))} />}
          </li>
        );
      })}
    </ul>
  );
}

function Act({
  m,
  target,
  kind,
  onCancel,
  onDone,
}: {
  m: AdminMessage;
  target: Target;
  kind: "withdraw" | "undo";
  onCancel: () => void;
  onDone: (v: AdminMessagesView) => void;
}) {
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const [takeBack, setTakeBack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One player who collected: taken back, their name typed. Everyone: stopping is one step; taking back asks for the phrase.
  const needName = kind === "undo" && !!target && !!m.collectedAt;
  const needPhrase = kind === "undo" && !target && takeBack;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r =
        kind === "withdraw"
          ? await call<AdminMessagesView>("/api/admin/message-withdraw", { id: m.id, reason })
          : await call<AdminMessagesView>("/api/admin/gift-undo", { id: m.id, reason, confirm: confirm || undefined, takeBack: !target ? takeBack : undefined });
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
          : target
            ? m.collectedAt
              ? `Takes the gift back from ${target.name} (credits only as far as they still have them; a badge only if it was new to them). A save state is taken first.`
              : `${target.name} hasn't collected it: this stops it being collected.`
            : "Stops anyone else collecting it."}
      </p>
      {kind === "undo" && !target && m.collected > m.takenBack && (
        <label className="admin__check">
          <input type="checkbox" checked={takeBack} onChange={(e) => setTakeBack(e.target.checked)} />
          <span>
            Also take it back from the {n(m.collected - m.takenBack)} players who collected it (a game save state is taken first)
          </span>
        </label>
      )}
      <label className="admin__field">
        <span className="label">Why (for the log)</span>
        <input value={reason} maxLength={ADMIN_TEXT_MAX} onChange={(e) => setReason(e.target.value)} required />
      </label>
      {(needName || needPhrase) && (
        <label className="admin__field">
          <span className="label">{needName ? `Type their name (${target?.name}) to confirm` : `Type ${TAKE_GIFT_BACK_PHRASE} to confirm`}</span>
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
