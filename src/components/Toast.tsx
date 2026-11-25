import { useState } from "react";
import { BADGE_INFO, type BadgeId } from "../../shared/badges";
import type { BadgeTier } from "../../shared/mission";
import { shareMessage } from "../../shared/share";
import { dismissForToday } from "../game/nudges";
import { dismissToast, useGame, type Toast as ToastData } from "../game/store";
import { Link } from "../router";
import { STILLS, badgeStill } from "../sprites";
import { PixelIcon } from "./PixelIcon";
import { ShareSheet } from "./ShareSheet";
import { Window } from "./Window";
import "./Toast.css";

const BADGE: Record<BadgeTier, { src: string; alt: string }> = {
  blue: { src: STILLS.badgeBlue.src, alt: "Blue signal badge" },
  orange: { src: STILLS.badgeOrange.src, alt: "Orange signal badge" },
  red: { src: STILLS.badgeRed.src, alt: "Red signal badge" },
};

/** A short message after a ping (the badge shows on the profile from phase 8). */
export function Toast({ toast, wide }: { toast: ToastData | null; wide: boolean }) {
  // The share sheet for a badge outlives the toast (it fades after a few seconds), and sits outside the live region.
  const [sharing, setSharing] = useState<BadgeId | null>(null);
  const { view } = useGame();
  return (
    <>
      <div className={wide ? "toast-region toast-region--wide" : "toast-region"} role="status" aria-live="polite">
        {toast && (
          <Window key={toast.id} tone="orange" className="toast">
            {toast.tier ? (
              <img className="toast__badge" src={BADGE[toast.tier].src} alt={BADGE[toast.tier].alt} width={32} height={32} />
            ) : toast.badge ? (
              <img className="toast__badge" src={badgeStill(toast.badge).src} alt="" width={32} height={32} />
            ) : (
              <PixelIcon name="signal" size={27} tone="orange" />
            )}
            <div className="toast__text">
              <p className="toast__title">{toast.title}</p>
              <p className="toast__body">{toast.body}</p>
              {toast.action && (
                <Link href={toast.action.href} className="toast__share toast__action" onClick={dismissToast}>
                  {toast.action.label}
                </Link>
              )}
              {toast.badge && (
                <button type="button" className="toast__share" onClick={() => setSharing(toast.badge!)} aria-haspopup="dialog">
                  <PixelIcon name="share" size={18} tone="orange" />
                  Share
                </button>
              )}
            </div>
            <button
              type="button"
              className="toast__close"
              onClick={() => {
                if (toast.nudge) dismissForToday(toast.nudge);
                dismissToast();
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </Window>
        )}
      </div>
      {sharing && (
        <ShareSheet
          moment="badge"
          detail={sharing}
          text={shareMessage("badge", { badge: BADGE_INFO[sharing].name, dest: view.destName })}
          title={`Share your ${BADGE_INFO[sharing].name} badge`}
          onClose={() => setSharing(null)}
        />
      )}
    </>
  );
}
