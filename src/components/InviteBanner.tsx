import { useEffect } from "react";
import { dismissInvite, lookUpInvite, useInviteName } from "../game/share";
import { Window } from "./Window";
import "./ShareSheet.css";

/** The invite landing (phase S1): "orbit_otter invited you to the crew", over the game with THRUST ready.
 * Shows only for someone who opened another player's crew link. No sign-in needed to play. */
export function InviteBanner({ known, destName }: { known: boolean; destName: string }) {
  const name = useInviteName();
  // Ask whose link it is once this browser has its device, so the visit (and, from S2, the recruit) is tied to it.
  useEffect(() => {
    if (known) lookUpInvite();
  }, [known]);
  if (!name) return null;
  return (
    <Window as="section" className="invite" aria-labelledby="invite-title">
      <div className="invite__text">
        <h2 id="invite-title" className="invite__title">
          {name} invited you to the crew
        </h2>
        <p className="invite__body">
          Everyone is pushing one probe to {destName}. Tap THRUST to help. No sign-up needed.
        </p>
      </div>
      <button type="button" className="invite__close" onClick={dismissInvite} aria-label="Close the invite">
        ×
      </button>
    </Window>
  );
}
