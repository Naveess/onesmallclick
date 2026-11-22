import { branchStopId, legKm, probeFor, stop as campaignStop, stopName } from "../../shared/campaign";
import { hms, int } from "../game/format";
import type { VoteOption } from "../game/store";
import { PixelIcon } from "./PixelIcon";
import { ShareNudge } from "./ShareNudge";
import { Window } from "./Window";
import "./BranchVote.css";

interface BranchVoteProps {
  /** Where the probe is now (the vote happens on arriving here). */
  at: string;
  options: VoteOption[];
  total: number;
  mine: number | null;
  leftS: number;
  onVote: (index: number) => void;
  busy?: boolean;
}

/** "1.07M km", "671,100 km", "186M km". */
function distance(km: number | null): string {
  if (km === null) return "";
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)}B km`;
  if (km >= 1e7) return `${Math.round(km / 1e6)}M km`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  return `${int(km)} km`;
}

/**
 * "Where next? The route splits" (1k, phase 8c): the two-way branch vote on arrival, from content/campaign.json.
 * Each branch shows its new probe, its distance and the planet tech it would unlock. The probe art comes in E2.
 */
export function BranchVote({ at, options, total, mine, leftS, onVote, busy = false }: BranchVoteProps) {
  const names = options.map((o) => stopName(branchStopId(o.id) ?? ""));
  return (
    <section className="branch" aria-labelledby="branch-label">
      <div className="branch__head">
        <h2 id="branch-label" className="branch__label">
          WHERE NEXT? THE ROUTE SPLITS
        </h2>
        <span className="branch__left num" aria-label={`Closes in ${hms(leftS)}`}>
          closes {hms(leftS)}
        </span>
      </div>
      <div className="branch__fork" aria-hidden="true">
        <span className="branch__here" />
        <span className="branch__here-label">{stopName(at)}</span>
        <span className="branch__stem" />
        <span className="branch__split" />
        <span className={mine === 0 ? "branch__row branch__row--a branch__row--mine" : "branch__row branch__row--a"} />
        <span className={mine === 1 ? "branch__row branch__row--b branch__row--mine" : "branch__row branch__row--b"} />
        <span className="branch__name branch__name--a">{names[0]}</span>
        <span className="branch__name branch__name--b">{names[1]}</span>
      </div>
      {options.map((o, i) => {
        const to = branchStopId(o.id) ?? "";
        const s = campaignStop(to);
        const probe = probeFor(to, at);
        const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
        const isMine = mine === i;
        return (
          <Window key={o.id} className={isMine ? "branch__option branch__option--mine" : "branch__option"}>
            <div className="branch__top">
              <div>
                <p className="branch__kick">
                  {i === 0 ? "BRANCH A" : "BRANCH B"}
                  {isMine ? " · YOUR VOTE" : ""}
                </p>
                <p className="branch__title">{names[i]}</p>
                <p className="branch__dist num">{distance(legKm(at, to))} from {stopName(at)}</p>
              </div>
              <p className="branch__pct num">{pct}%</p>
            </div>
            <div className="branch__bar" aria-hidden="true">
              <div className="branch__fill" style={{ width: `${pct}%` }} />
            </div>
            {probe && (
              <div className="branch__box">
                <p className="branch__box-label">NEW PROBE</p>
                <p className="branch__box-name">{probe.name}</p>
                <p className="branch__box-text">{probe.pitch}</p>
              </div>
            )}
            {s?.tech && (
              <div className="branch__box branch__box--tech">
                <PixelIcon name="bolt" size={18} tone="blue" />
                <div>
                  <p className="branch__box-label branch__box-label--blue">PLANET TECH IF WE GO HERE</p>
                  <p className="branch__box-name">{s.tech.name}</p>
                  <ul className="branch__medals">
                    <li>
                      <span>Gold</span>
                      <span className="num">{s.tech.gold}</span>
                    </li>
                    <li>
                      <span>Silver</span>
                      <span className="num">{s.tech.silver}</span>
                    </li>
                    <li>
                      <span>Bronze</span>
                      <span className="num">{s.tech.bronze}</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}
            <button
              type="button"
              className="pbtn pbtn--blue pbtn--block branch__vote"
              onClick={() => onVote(i)}
              disabled={mine !== null || busy}
              aria-pressed={isMine}
            >
              {isMine ? `You voted for ${names[i]}` : mine !== null ? "Vote cast" : `Vote for ${names[i]}`}
            </button>
          </Window>
        );
      })}
      <p className="branch__foot">
        {int(total)} vote{total === 1 ? "" : "s"} · one vote each · a tie is settled by a random draw
      </p>
      {names.length === 2 && (
        <ShareNudge
          moment="branch"
          detail={at}
          fill={{ a: names[0], b: names[1] }}
          label="Ask the crew to vote"
          title={`${names[0]} or ${names[1]}? Ask the crew`}
        />
      )}
    </section>
  );
}
