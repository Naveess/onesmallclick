import { localTime, onUtc, utcTime } from "../game/format";
import "./LocalTime.css";

/**
 * Phase Q1a: a moment in the player's own time, with UTC in smaller text beside it, so the crew still shares one
 * clock: "7:00 pm your time · 00:00 UTC". The UTC part also shows as a tooltip.
 */
export function LocalTime({ at, now = Date.now(), utc = true }: { at: number; now?: number; utc?: boolean }) {
  const u = utcTime(at, now);
  if (onUtc(at)) {
    return (
      <time className="local-time" dateTime={new Date(at).toISOString()}>
        {u}
      </time>
    );
  }
  return (
    <time className="local-time" dateTime={new Date(at).toISOString()} title={u}>
      {localTime(at, now)} your time
      {utc && <small className="local-time__utc"> · {u}</small>}
    </time>
  );
}
