import { useState } from "react";
import { BETA, betaOpen } from "../../shared/beta";
import { Link } from "../router";
import { Window } from "./Window";
import "./BetaBanner.css";

const CLOSED_KEY = "osc.betaClosed";

function readClosed(): boolean {
  try {
    return localStorage.getItem(CLOSED_KEY) === "1";
  } catch {
    return false; // storage blocked: show it
  }
}

/**
 * The early-access notice (prompts 82-83), at the top of every game page until launch (content/beta.json).
 * One line on a phone ("Progress resets at launch on 15 Dec"), opening to the full text: the reset, the launch
 * date that may move, the Early Beta badge for signing in, and the thank-you. Closing it is remembered on this
 * device. Hidden in safe mode, when the Ping matters more.
 */
export function BetaBanner({ signedIn, hasBadge, safe }: { signedIn: boolean; hasBadge: boolean; safe: boolean }) {
  const [closed, setClosed] = useState(readClosed);
  const [open, setOpen] = useState(false);
  if (closed || safe || !betaOpen(Date.now())) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(CLOSED_KEY, "1");
    } catch {
      // storage blocked: closed until the next reload
    }
  };
  return (
    <Window as="aside" tone="orange" className="beta" aria-labelledby="beta-title">
      <div className="beta__row">
        <p className="beta__line">
          <strong id="beta-title" className="beta__label">
            {BETA.title}
          </strong>{" "}
          {BETA.short}
        </p>
        <button type="button" className="beta__more" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="beta-body">
          {open ? "Less" : "More"}
        </button>
        <button type="button" className="beta__close" onClick={close} aria-label="Close the early access notice">
          ×
        </button>
      </div>
      {open && (
        <div id="beta-body" className="beta__body">
          {BETA.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {signedIn ? (
            hasBadge && <p className="beta__have">{BETA.haveBadge}</p>
          ) : (
            <Link href="/sign-in" className="pbtn pbtn--orange beta__signin">
              {BETA.signIn}
            </Link>
          )}
        </div>
      )}
    </Window>
  );
}
