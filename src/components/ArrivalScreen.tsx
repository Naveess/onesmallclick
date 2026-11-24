import { useEffect, useState } from "react";
import { probeFor, stop as campaignStop, stopName } from "../../shared/campaign";
import type { CreditsInfo } from "../../shared/boards";
import { destinationArt } from "../game/flightArt";
import { int } from "../game/format";
import { castVote, useGame } from "../game/store";
import { SPRITES } from "../sprites";
import { usePrefersReducedMotion } from "../theme";
import { BranchVote } from "./BranchVote";
import { Flag } from "./Flag";
import { PixelButton } from "./PixelButton";
import { ShareNudge } from "./ShareNudge";
import { ProbeArt } from "./ProbeArt";
import { Sprite } from "./Sprite";
import { Window } from "./Window";
import "./ArrivalScreen.css";

interface ArrivalScreenProps {
  arrival: { missionId: number; stop: string; at: number };
  wide: boolean;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });

/** 31,400,000,000 → "31.4 billion"; 2,412,446 stays whole. */
function big(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} billion`;
  if (n >= 1e8) return `${(n / 1e6).toFixed(0)} million`;
  return int(n);
}

/**
 * The arrival screen (1k, phase 8c): "We made it", the rolling mission credits (every signed-in name with its
 * flag, guests counted), then the branch vote. The arrival rewards (medal, planet tech, stamp, unlock) come in E4b.
 */
export function ArrivalScreen({ arrival, wide, onClose }: ArrivalScreenProps) {
  const { probe, player, view, connection } = useGame();
  const reduceMotion = usePrefersReducedMotion();
  const [credits, setCredits] = useState<CreditsInfo | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = (tries: number) =>
      fetch(`/api/credits?mission=${arrival.missionId}`, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((c: CreditsInfo) => alive && setCredits(c))
        .catch(() => {
          // The credits are written a moment after arrival: try again a few times.
          if (alive && tries > 0) window.setTimeout(() => void load(tries - 1), 3000);
          else if (alive) setFailed(true);
        });
    void load(5);
    return () => {
      alive = false;
    };
  }, [arrival.missionId]);

  const s = campaignStop(arrival.stop);
  const name = stopName(arrival.stop);
  const orbitWord = arrival.stop === "heliopause" ? "REACHED" : "ORBIT REACHED";
  const days = credits ? Math.max(1, Math.ceil((credits.arrivedAt - credits.startedAt) / 86_400_000)) : null;
  const voting = probe.vote.kind === "branch" && probe.stop === arrival.stop && probe.arrivedAt !== null;
  const movedOn = probe.missionId > arrival.missionId;
  const nextProbe = movedOn ? probeFor(probe.stop, probe.fromStop) : undefined;

  // The roll: every named crew member, then the guests, twice over so it loops without a jump.
  const lines = credits
    ? [
        ...credits.names.map((c, i) => ({ key: `n${i}`, name: c.name, cc: c.cc })),
        ...(credits.guests > 0 ? [{ key: "guests", name: `…and ${int(credits.guests)} guest crew`, cc: null }] : []),
      ]
    : [];
  const rollSeconds = Math.max(20, lines.length * 2.4);

  return (
    <main className={wide ? "arrival-screen arrival-screen--wide" : "arrival-screen"} aria-labelledby="arrival-title">
      <div className="arrival-screen__art" aria-hidden="true">
        {arrival.stop === "mars" ? (
          <Sprite sprite={SPRITES.mars} scale={2} />
        ) : (
          <img className="arrival-screen__planet" src={destinationArt(arrival.stop, 31)} alt="" width={256} height={256} />
        )}
        <div className="arrival-screen__probe">
          <ProbeArt id={view.probeId} />
        </div>
      </div>

      <header className="arrival-screen__head">
        <p className="arrival-screen__kick">
          {name.toUpperCase()} {orbitWord}
        </p>
        <h1 id="arrival-title" className="arrival-screen__title">
          We made it.
        </h1>
        <p className="arrival-screen__when num">
          {dateFmt.format(arrival.at)} · {timeFmt.format(arrival.at)} UTC
        </p>
        {credits && (
          <p className="arrival-screen__stats">
            {days} day{days === 1 ? "" : "s"} · {int(credits.crew)} crew · {big(credits.taps)} taps
          </p>
        )}
      </header>

      <section className="arrival-screen__credits" aria-label="Mission credits">
        {!credits && !failed && <p className="arrival-screen__note">Rolling the credits…</p>}
        {failed && <p className="arrival-screen__note">The credits are on their way. Have a look again in a minute.</p>}
        {credits && lines.length === 0 && <p className="arrival-screen__note">The probe got here by coasting. Every tap counts next time.</p>}
        {credits && lines.length > 0 && (
          <div
            className={reduceMotion ? "arrival-screen__roll arrival-screen__roll--still" : "arrival-screen__roll"}
            // Pixel steps, not a smooth glide: about 2px a step.
            style={{ animationDuration: `${rollSeconds}s`, animationTimingFunction: `steps(${Math.max(40, lines.length * 13)})` }}
          >
            {(reduceMotion ? [lines] : [lines, lines]).map((set, k) => (
              <ul key={k} className="arrival-screen__names" aria-hidden={k === 1 ? true : undefined}>
                {set.map((l) => (
                  <li key={l.key}>
                    <span>{l.name}</span>
                    {l.cc && <Flag cc={l.cc} />}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}
      </section>
      {credits && credits.names.length > 0 && !player.account && (
        <p className="arrival-screen__note">Signed-in crew are named in the credits. Guests are counted.</p>
      )}

      {voting && (
        <BranchVote
          at={arrival.stop}
          options={probe.vote.options}
          total={view.voteTotal}
          mine={player.voteChoice}
          leftS={view.voteLeftS}
          onVote={(i) => void castVote(i)}
          busy={player.voting || connection !== "live"}
        />
      )}
      {movedOn && (
        <Window className="arrival-screen__next">
          <p className="arrival-screen__kick">ON TO {view.destName.toUpperCase()}</p>
          <p>
            {nextProbe?.name ?? "The probe"} is already on its way{s?.branchVote ? "" : ` from ${name}`}.
          </p>
        </Window>
      )}

      <ShareNudge
        moment="arrival"
        detail={arrival.stop}
        fill={{ dest: name, days }}
        alt={days === null}
        variant="orange"
        label={`Share: we made it to ${name}`}
        title={`Share the arrival at ${name}`}
      />
      <PixelButton variant="outline" block onClick={onClose}>
        Back to the mission
      </PixelButton>
    </main>
  );
}
