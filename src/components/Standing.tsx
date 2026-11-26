import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { untilText, type Hold } from "../../shared/moderation";
import { DISCORD_INVITE } from "../../shared/community";
import { ackWarning } from "../game/store";
import { Link } from "../router";
import { FeedbackButton } from "./Feedback";
import { PixelButton } from "./PixelButton";
import { Window } from "./Window";
import "./MaintenanceBanner.css";
import "./ShareSheet.css";
import "./Standing.css";

// Phase A2a (decisions 36-40 and 45): what a player sees when mission control acts on their account. No shadow bans: every
// warning, pause, hide and ban says so, with the reason and how to appeal (the "Report a bug or idea" form's Appeal).

/** Timed out: under the header on every game page, in the early-access banner's place. It ends by itself. */
export function PausedBanner({ hold, signedIn }: { hold: Hold; signedIn: boolean }) {
  return (
    <Window as="aside" tone="orange" className="maint standing" role="status" aria-labelledby="paused-title">
      <p className="maint__line">
        <strong id="paused-title" className="maint__label">
          Your account is paused{hold.until !== null ? ` until ${untilText(hold.until)}` : ""}
        </strong>
        <span className="maint__text">{hold.reason}</span>
      </p>
      <p className="maint__small">
        You can look around, but taps, auto-thrust, pings, votes and upgrades don't count until then. It ends by itself.
      </p>
      <p className="standing__links">
        <FeedbackButton signedIn={signedIn} appeal className="standing__link" />
        <Link href="/terms#crew-rules" className="standing__link">
          Crew rules
        </Link>
      </p>
    </Window>
  );
}

/** Banned: in place of the page. The header and footer stay, so the rules, the appeal and Discord are one tap away. */
export function BanScreen({ hold, signedIn }: { hold: Hold; signedIn: boolean }) {
  return (
    <main className="standing-ban" aria-labelledby="ban-title">
      <Window as="section" tone="orange" className="standing-ban__window">
        <p className="standing-ban__label">MISSION CONTROL</p>
        <h1 id="ban-title" className="standing-ban__title">
          {signedIn ? "This account is banned" : "This device is banned"}
        </h1>
        <p className="standing-ban__reason">{hold.reason}</p>
        <p className="standing-ban__small">
          {hold.until !== null
            ? `It ends ${untilText(hold.until)} (your time). Until then nothing you do here counts toward the mission.`
            : "Nothing you do here counts toward the mission, and you're off the leaderboards."}{" "}
          If you think it's a mistake, appeal and tell us why: every appeal is read.
        </p>
        <div className="standing-ban__buttons">
          <FeedbackButton signedIn={signedIn} appeal className="pbtn pbtn--blue pbtn--block" />
          <Link href="/terms#crew-rules" className="pbtn pbtn--outline pbtn--block">
            Read the crew rules
          </Link>
          <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="standing__link">
            Or ask on Discord
          </a>
        </div>
      </Window>
    </main>
  );
}

/** A warning: a box they have to tap OK on (mission control sees when they did). One at a time, oldest first. */
export function WarningDialog({ warning }: { warning: { id: number; reason: string } }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, [warning.id]);
  return createPortal(
    <dialog
      ref={ref}
      className="share-sheet standing-warn"
      aria-labelledby="warn-title"
      onCancel={(e) => e.preventDefault()} // it needs the OK
    >
      <div className="share-sheet__window">
        <p className="share-sheet__label">WARNING FROM MISSION CONTROL</p>
        <h2 id="warn-title" className="share-sheet__title">
          Please read this
        </h2>
        <p className="standing-warn__reason">{warning.reason}</p>
        <p className="standing-warn__small">
          It's on your record. If it happens again your account may be paused. The <a href="/terms#crew-rules">crew rules</a> say
          what's fair.
        </p>
        <PixelButton block autoFocus onClick={() => void ackWarning(warning.id)}>
          OK, got it
        </PixelButton>
      </div>
    </dialog>,
    document.body,
  );
}

/** Hidden from the boards (or banned): the note at the top of /ranks. */
export function HiddenNote({ reason, signedIn }: { reason: string; signedIn: boolean }) {
  return (
    <Window as="aside" tone="orange" className="maint standing" role="status" aria-labelledby="hidden-title">
      <p className="maint__line">
        <strong id="hidden-title" className="maint__label">
          You're hidden from the leaderboards
        </strong>
        <span className="maint__text">{reason}</span>
      </p>
      <p className="maint__small">You can still play and push the probe; your km just don't show on the boards.</p>
      <p className="standing__links">
        <FeedbackButton signedIn={signedIn} appeal className="standing__link" />
      </p>
    </Window>
  );
}
