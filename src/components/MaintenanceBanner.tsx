import { Window } from "./Window";
import "./MaintenanceBanner.css";

/**
 * Maintenance mode (phase A1c-2): across the top of every game page while mission control has the game frozen.
 * The message is written in /admin. It can't be closed: it goes when the game is back.
 */
export function MaintenanceBanner({ message }: { message: string }) {
  return (
    <Window as="aside" tone="orange" className="maint" role="status" aria-labelledby="maint-title">
      <p className="maint__line">
        <strong id="maint-title" className="maint__label">
          Paused for maintenance
        </strong>
        <span className="maint__text">{message}</span>
      </p>
      <p className="maint__small">The probe, the signal timer and the vote are frozen, so nobody loses anything while it's paused.</p>
    </Window>
  );
}
