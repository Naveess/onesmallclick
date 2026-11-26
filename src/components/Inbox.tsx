import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BADGE_INFO } from "../../shared/badges";
import type { CollectResult, Gift, InboxItem } from "../../shared/messages";
import { collectGift, loadInbox, markRead } from "../game/store";
import { LocalTime } from "./LocalTime";
import { PixelButton } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import "./ShareSheet.css";
import "./Inbox.css";

// Phase A2b-1 (decisions 39 and 40): messages from mission control. An envelope in the game's header (an orange count
// when something's unopened) opens the inbox: each message with its time in your own timezone, and Collect when it
// carries a gift of credits or a badge. Opening the inbox marks what it shows as read. Messages are kept 90 days.

const credits = (n: number) => n.toLocaleString("en-GB");
const giftText = (g: Gift) => ("credits" in g ? `${credits(g.credits)} credits` : `the ${BADGE_INFO[g.badge]?.name ?? g.badge} badge`);

/** The envelope. `wide`: the desktop header's text style (icon and "Messages"). */
export function InboxButton({ unread, wide }: { unread: number; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const label = unread > 0 ? `Messages, ${unread} new` : "Messages";
  return (
    <>
      <button
        type="button"
        className={wide ? "game-nav__item inbox-btn inbox-btn--wide" : "game-head__profile inbox-btn"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={wide ? undefined : label}
      >
        <PixelIcon name="mail" size={18} tone={unread > 0 ? "orange" : wide ? "muted" : "blue"} />
        {wide && <span>Messages</span>}
        {unread > 0 && (
          <span className="inbox-btn__count" aria-hidden={wide ? undefined : true}>
            {unread > 9 ? "9+" : unread}
            {wide && <span className="visually-hidden"> new</span>}
          </span>
        )}
      </button>
      {open && <InboxSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function InboxSheet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<InboxItem[] | null | "error">(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    let gone = false;
    void loadInbox().then((list) => {
      if (gone) return;
      setItems(list ?? "error");
      if (list) void markRead(list.filter((m) => !m.read).map((m) => m.id));
    });
    return () => {
      gone = true;
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className="share-sheet inbox"
      aria-labelledby="inbox-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close(); // a click on the backdrop
      }}
    >
      <div className="share-sheet__window">
        <p className="share-sheet__label">MISSION CONTROL</p>
        <h2 id="inbox-title" className="share-sheet__title">
          Messages
        </h2>
        {items === null && <p className="inbox__empty">Loading…</p>}
        {items === "error" && <p className="inbox__empty">Couldn't load your messages. Try again in a moment.</p>}
        {Array.isArray(items) && items.length === 0 && <p className="inbox__empty">No messages yet. Mission control will write here if there's news for you.</p>}
        {Array.isArray(items) && items.length > 0 && (
          <ul className="inbox__list">
            {items.map((m) => (
              <Message key={m.id} m={m} />
            ))}
          </ul>
        )}
        <p className="share-sheet__note">Messages are kept for 90 days.</p>
        <PixelButton variant="outline" className="share-sheet__close" onClick={() => ref.current?.close()} autoFocus>
          Close
        </PixelButton>
      </div>
    </dialog>,
    document.body,
  );
}

const COLLECT_ERROR: Record<Exclude<CollectResult, { ok: true }>["error"], string> = {
  paused: "Gifts wait while your account is paused. Collect it when the pause ends.",
  gone: "This gift can't be collected any more.",
  collected: "You've already collected this gift.",
  "no-gift": "This message has no gift.",
  busy: "That didn't work. Try again in a moment.",
};

function Message({ m }: { m: InboxItem }) {
  const [collected, setCollected] = useState<number | null>(m.collectedAt);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const collect = async () => {
    setBusy(true);
    setNote("");
    const r = await collectGift(m.id);
    setBusy(false);
    if (r.ok) {
      setCollected(Date.now());
      setNote(r.badge ? (r.badgeNew ? "Badge added to your profile." : "You already had this badge.") : `${credits(r.credits)} credits added.`);
    } else {
      if (r.error === "collected") setCollected(Date.now());
      setNote(COLLECT_ERROR[r.error]);
    }
  };
  return (
    <li className={m.read ? "inbox__item" : "inbox__item inbox__item--new"}>
      <p className="inbox__meta">
        {!m.read && <span className="inbox__new">NEW</span>}
        <LocalTime at={m.at} utc={false} />
        {m.everyone && <span> · to all crew</span>}
      </p>
      <h3 className="inbox__title">{m.title}</h3>
      <p className="inbox__body">{m.body}</p>
      {m.gift && (
        <div className="inbox__gift">
          <p className="inbox__gift-line">
            <PixelIcon name="star" size={18} tone="orange" />
            <span>Gift: {giftText(m.gift)}</span>
          </p>
          {collected !== null ? (
            <p className="inbox__collected">
              <PixelIcon name="check" size={18} tone="blue" /> Collected
            </p>
          ) : m.giftClosed ? (
            <p className="inbox__note">This gift can't be collected any more.</p>
          ) : (
            <PixelButton block onClick={() => void collect()} disabled={busy}>
              {busy ? "Collecting…" : "Collect"}
            </PixelButton>
          )}
          {note && (
            <p className="inbox__note" role="status">
              {note}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
