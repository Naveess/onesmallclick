import { CLICK_BADGES, nextClickBadge } from "../../shared/clicks";
import { int } from "../game/format";
import { Window } from "./Window";
import "./ClickCounter.css";

interface ClickCounterProps {
  /** Your THRUST taps today (UTC) and in all time. */
  today: number;
  all: number;
  wide?: boolean;
}

/** "You've clicked" under THRUST (design 1a/1b): today's clicks as an odometer, all time, and the next click badge.
 * The badges count all-time clicks (Nav, prompt 33), so the bar follows the all-time total. */
export function ClickCounter({ today, all, wide = false }: ClickCounterProps) {
  // At least six digits, grouped in threes: 001,284.
  const digits = String(Math.max(0, Math.floor(today))).padStart(6, "0");
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
  const chars = [...groups.join(",")];
  let d = -1;

  const goal = nextClickBadge(all);
  const last = CLICK_BADGES[CLICK_BADGES.length - 1];
  const bar = goal ? Math.min(1, all / goal.clicks) : 1;

  return (
    <Window as="section" className={wide ? "clicks clicks--wide" : "clicks"} aria-labelledby="clicks-label">
      <div className="clicks__head">
        <h2 id="clicks-label" className="clicks__label">
          YOU&rsquo;VE CLICKED
        </h2>
        <span className="clicks__when">today</span>
      </div>
      <div className="clicks__row">
        <div className="clicks__odo" role="img" aria-label={`${int(today)} clicks today`}>
          {chars.map((c, i) => {
            if (c === ",") {
              return (
                <span key={i} className="clicks__comma">
                  ,
                </span>
              );
            }
            d += 1;
            // As in the design: zeros in the first group stay dim until a real digit arrives.
            const lead = d < 3 && Number(digits.slice(0, d + 1)) === 0;
            const classes = ["clicks__digit", lead && "clicks__digit--lead", d === digits.length - 1 && "clicks__digit--last"];
            return (
              <span key={i} className={classes.filter(Boolean).join(" ")}>
                {c}
              </span>
            );
          })}
        </div>
        <p className="clicks__all">
          {int(all)}
          <br />
          <span>all time</span>
        </p>
      </div>
      <div className="clicks__goal">
        <div className="clicks__goal-text">
          {goal ? (
            <>
              <span>
                Next: <span className="clicks__badge">{goal.name}</span> at {int(goal.clicks)}
              </span>
              <span className="num">{int(goal.clicks - all)} to go</span>
            </>
          ) : (
            <span>
              <span className="clicks__badge">{last.name}</span> reached
            </span>
          )}
        </div>
        <div
          className="clicks__bar"
          role="progressbar"
          aria-label={goal ? `Clicks towards ${goal.name}` : `${last.name} reached`}
          aria-valuemin={0}
          aria-valuemax={goal?.clicks ?? last.clicks}
          aria-valuenow={Math.min(all, goal?.clicks ?? last.clicks)}
        >
          <div className="clicks__fill" style={{ width: `${Math.round(bar * 100)}%` }} />
        </div>
      </div>
    </Window>
  );
}
