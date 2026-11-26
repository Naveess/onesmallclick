import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { FEEDBACK_KINDS, FEEDBACK_KIND_NAMES, FEEDBACK_MAX, type FeedbackKind } from "../../shared/feedback";
import { turnstileToken } from "../game/turnstile";
import { PixelButton } from "./PixelButton";
import "./ShareSheet.css";
import "./Feedback.css";

/** Phase Q1a: the page, screen size and browser, so a bug can be reproduced. Nothing that identifies anyone. */
function deviceInfo(): string {
  const ua = navigator.userAgent.replace(/\s+/g, " ").slice(0, 220);
  return `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x · ${ua}`;
}

const ERRORS: Record<string, string> = {
  "busy-network": "Lots of reports have come from your network today. Please try again tomorrow.",
  "bot-check": "The bot check didn't pass. Please try again.",
  invalid: "Pick a kind and write a message first.",
};

/**
 * "Report a bug or idea" (phase Q1a): a kind, a message of up to 1,000 characters and, for a signed-in player, an
 * optional "contact me" (the account's email is looked up only if ticked). Turnstile and the per-network cap guard it.
 * A modal <dialog> built from the share sheet's window.
 */
export function FeedbackDialog({ signedIn, onClose, initialKind = "bug" }: { signedIn: boolean; onClose: () => void; initialKind?: FeedbackKind }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const close = () => ref.current?.close();
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (state !== "idle" || !message.trim()) return;
    setState("sending");
    setError(null);
    try {
      const token = await turnstileToken("feedback");
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind, message: message.trim(), contact: signedIn && contact, page: window.location.pathname, info: deviceInfo() }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !out.ok) throw new Error(out.error ?? `status ${res.status}`);
      setState("sent");
    } catch (err) {
      setError(ERRORS[(err as Error).message] ?? "Couldn't send it. Check your connection and try again.");
      setState("idle");
    }
  };

  const left = FEEDBACK_MAX - message.length;
  return (
    <dialog
      ref={ref}
      className="share-sheet feedback"
      aria-labelledby="feedback-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(); // a click on the backdrop
      }}
    >
      <div className="share-sheet__window">
        <p className="share-sheet__label">FEEDBACK</p>
        <h2 id="feedback-title" className="share-sheet__title">
          Report a bug or idea
        </h2>
        {state === "sent" ? (
          <>
            <p className="feedback__done" role="status">
              Thank you. It's on its way to the flight deck, and every report gets read.
            </p>
            <PixelButton block onClick={close} autoFocus>
              Close
            </PixelButton>
          </>
        ) : (
          <form className="feedback__form" onSubmit={(e) => void send(e)}>
            <fieldset className="feedback__kinds">
              <legend className="feedback__label">What is it?</legend>
              {FEEDBACK_KINDS.map((k) => (
                <label key={k} className={kind === k ? "feedback__kind feedback__kind--on" : "feedback__kind"}>
                  <input type="radio" name="feedback-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                  {FEEDBACK_KIND_NAMES[k]}
                </label>
              ))}
            </fieldset>
            <label className="feedback__field">
              <span className="feedback__label">
                {kind === "bug"
                  ? "What happened, and what did you expect?"
                  : kind === "idea"
                    ? "What's your idea?"
                    : kind === "appeal"
                      ? "Which decision, and why should we look again?"
                      : "Your message"}
              </span>
              <textarea
                className="feedback__text"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, FEEDBACK_MAX))}
                maxLength={FEEDBACK_MAX}
                rows={5}
                required
                autoFocus
              />
              <span className="feedback__count num" aria-live="polite">
                {left < 100 ? `${left} characters left` : `Up to ${FEEDBACK_MAX.toLocaleString("en-GB")} characters`}
              </span>
            </label>
            {signedIn && (
              <label className="feedback__check">
                <input type="checkbox" checked={contact} onChange={(e) => setContact(e.target.checked)} />
                You can contact me about this (using my account's email)
              </label>
            )}
            {kind === "appeal" ? (
              <p className="feedback__small">
                An appeal about a warning, a pause, being hidden from the boards or a ban. It's sent with who you are in the
                game (your account, or this device), so mission control can look at your record. Every appeal is read.
              </p>
            ) : (
              <p className="feedback__small">
                The page you're on, your screen size and your browser are sent with it, to help fix bugs. Nothing else about
                you{signedIn ? " unless you tick the box" : ""}.
              </p>
            )}
            {error && (
              <p className="feedback__error" role="alert">
                {error}
              </p>
            )}
            <div className="feedback__buttons">
              <PixelButton type="submit" disabled={state === "sending" || !message.trim()}>
                {state === "sending" ? "Sending…" : "Send"}
              </PixelButton>
              <PixelButton type="button" variant="outline" onClick={close}>
                Cancel
              </PixelButton>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}

/** The footer's (and the crash screen's) "Report a bug or idea". `/?feedback` opens it (the contact page links there). */
export function FeedbackButton({
  signedIn,
  className,
  autoOpen = false,
  appeal = false,
}: {
  signedIn: boolean;
  className?: string;
  autoOpen?: boolean;
  /** Phase A2a: "Appeal", opening the form on its Appeal option. */
  appeal?: boolean;
}) {
  const [open, setOpen] = useState(() => autoOpen && new URLSearchParams(window.location.search).has("feedback"));
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {appeal ? "Appeal" : "Report a bug or idea"}
      </button>
      {/* On <body>, so the footer's link-style button rules don't reach the dialog's buttons. */}
      {open && createPortal(<FeedbackDialog signedIn={signedIn} initialKind={appeal ? "appeal" : "bug"} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
