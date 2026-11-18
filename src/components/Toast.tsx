import type { BadgeTier } from "../../shared/mission";
import { dismissToast, type Toast as ToastData } from "../game/store";
import { STILLS } from "../sprites";
import { PixelIcon } from "./PixelIcon";
import { Window } from "./Window";
import "./Toast.css";

const BADGE: Record<BadgeTier, { src: string; alt: string }> = {
  blue: { src: STILLS.badgeBlue.src, alt: "Blue signal badge" },
  orange: { src: STILLS.badgeOrange.src, alt: "Orange signal badge" },
  red: { src: STILLS.badgeRed.src, alt: "Red signal badge" },
};

/** A short message after a ping (the badge shows on the profile from phase 8). */
export function Toast({ toast, wide }: { toast: ToastData | null; wide: boolean }) {
  return (
    <div className={wide ? "toast-region toast-region--wide" : "toast-region"} role="status" aria-live="polite">
      {toast && (
        <Window key={toast.id} tone="orange" className="toast">
          {toast.tier ? (
            <img className="toast__badge" src={BADGE[toast.tier].src} alt={BADGE[toast.tier].alt} width={32} height={32} />
          ) : (
            <PixelIcon name="signal" size={27} tone="orange" />
          )}
          <div className="toast__text">
            <p className="toast__title">{toast.title}</p>
            <p className="toast__body">{toast.body}</p>
          </div>
          <button type="button" className="toast__close" onClick={dismissToast} aria-label="Dismiss">
            ×
          </button>
        </Window>
      )}
    </div>
  );
}
