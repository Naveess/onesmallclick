import { PixelIcon } from "./PixelIcon";
import "./PingButton.css";

interface PingButtonProps {
  onPing: () => void;
  /** Already pinged today, or a ping is on its way. */
  disabled?: boolean;
  /** Small line under PING. */
  hint?: string;
}

/** The big orange 8-sided PING from safe mode (1f). It looks the same in both themes (fixed --ping-* colours). */
export function PingButton({ onPing, disabled = false, hint = "wake the probe" }: PingButtonProps) {
  return (
    <div className="ping">
      <div className="ping__glow" aria-hidden="true" />
      <div className="ping__focus" aria-hidden="true" />
      <button type="button" className="ping__button" onClick={onPing} disabled={disabled} aria-label={`Ping, ${hint}`}>
        <span className="ping__gap" />
        <span className="ping__face" />
        <span className="ping__label">
          <span style={{ color: "var(--thrust-label)" }}>
            <PixelIcon name="signal" size={27} />
          </span>
          <span className="ping__word">PING</span>
          <span className="ping__hint">{hint}</span>
        </span>
      </button>
    </div>
  );
}
