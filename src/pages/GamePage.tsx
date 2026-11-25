import { kmMi, kmMiFine, speedKmMi } from "../../shared/units";
import { useRef, useState } from "react";
import { ClickCounter } from "../components/ClickCounter";
import { FlightView, type FlightHandle } from "../components/FlightView";
import { AdSlot, ArrivalEstimate, SignalCard, VoteCard } from "../components/GameCards";
import { GameShell } from "../components/GameShell";
import { SafeMode } from "../components/SafeMode";
import { PixelIcon } from "../components/PixelIcon";
import { ThrustButton } from "../components/ThrustButton";
import { castVote, openArrival, ping, switches, thrust, useGame } from "../game/store";
import { BranchVote } from "../components/BranchVote";
import { DestinationFile } from "../components/DestinationFile";
import { InviteBanner } from "../components/InviteBanner";
import { BurnCard, BurnScreen } from "../components/LandingBurn";
import { ShareNudge } from "../components/ShareNudge";
import { milestonesFor } from "../../shared/milestones";
import { int, probeSpeed } from "../game/format";
import { useDocumentTitle } from "./useDocumentTitle";
import "./GamePage.css";

/** The signal's "final hour": the ask-the-crew share shows under this many seconds left. */
const SIGNAL_ASK_S = 3600;

/** "/": the game home (1a phone, 1b wide), the shared probe is live from phase 4 (store.ts says what is still fake). */
export function GamePage() {
  useDocumentTitle("OneSmallClick · push one probe to Mars together");
  const { probe, player, view, connection } = useGame();
  const flight = useRef<FlightHandle>(null);
  // The landing burn screen (1o), opened from the home card's "Join the burn".
  const [burnOpen, setBurnOpen] = useState(false);
  // THRUST also boosts the probe in the flight view, with its "+km".
  const onThrust = () => {
    const km = thrust();
    flight.current?.boost(km);
    return km;
  };

  return (
    <GameShell tab="mission" sky={view.burn && burnOpen ? "arrival" : undefined}>
      {({ wide, openUpgrades }) => {
        // The flight view replaces JourneyTrack (prompt 32); JourneyTrack.tsx stays until the flight view is approved.
        const flightProps = {
          progress: view.progress,
          distanceKm: probe.distanceKm,
          routeKm: probe.routeKm,
          speedKmS: view.speedKmS,
          crewKmS: probe.crewKmS,
          online: probe.online,
          handful: switches.handful,
          arrivalAt: view.arrivalAt,
          milestones: milestonesFor(probe.stop),
          nextMilestone: view.nextMilestone,
          toNextKm: view.toNextKm,
          safe: view.safe,
          urgent: view.signalUrgent,
          signalLeftS: view.signalLeftS,
          paused: view.paused,
          stop: probe.stop,
          fromStop: probe.fromStop,
          orbit: view.orbit,
          probeId: view.probeId,
          probeTag: view.probeTag,
          moonLeg: view.moonLeg,
          burn: view.burn,
        };
        const track = <FlightView handle={flight} wide={wide} {...flightProps} />;
        const invite = <InviteBanner known={player.known} destName={view.destName} />;
        // The landing burn (E4b part 2b): the final hour before arrival.
        if (view.burn && burnOpen) {
          return (
            <BurnScreen
              burn={view.burn}
              wide={wide}
              online={probe.online}
              stop={probe.stop}
              probeId={view.probeId}
              probeTag={view.probeTag}
              onThrust={thrust}
              onBack={() => setBurnOpen(false)}
            />
          );
        }
        const burnCard = view.burn && <BurnCard burn={view.burn} wide={wide} onJoin={() => setBurnOpen(true)} />;
        if (view.safe) {
          return (
            <SafeMode
              banner={invite}
              wide={wide}
              quietS={view.quietS}
              arrivalAt={view.arrivalAt}
              arrivalBeforeAt={view.arrivalBeforeAt}
              setbackMs={view.setbackMs}
              paused={view.paused}
              flight={<FlightView {...flightProps} />}
              pinged={player.pingedToday}
              pinging={player.pinging}
              onPing={() => void ping()}
            />
          );
        }

        // The signal's final hour (phase S1): nobody has pinged today, so ask the crew. Urgent shares get answered fast.
        const askPing = !view.paused && view.signalLeftS < SIGNAL_ASK_S && (
          <ShareNudge moment="signal" variant="orange" label="Under an hour left · ask the crew to Ping" title="Ask the crew to Ping" />
        );
        const clicks = <ClickCounter wide={wide} today={player.tapsToday} all={player.tapsAll} />;
        const signal = (
          <SignalCard
            wide={wide}
            leftS={view.signalLeftS}
            urgent={view.signalUrgent}
            pinged={player.pingedToday}
            pinging={player.pinging}
            streakDays={player.pingStreakDays}
            onPing={() => void ping()}
          />
        );
        // On arrival the daily vote gives way to the branch vote (phase 8c).
        const vote =
          probe.vote.kind === "branch" ? (
            <BranchVote
              at={probe.stop}
              options={probe.vote.options}
              total={view.voteTotal}
              mine={player.voteChoice}
              leftS={view.voteLeftS}
              onVote={(i) => void castVote(i)}
              busy={player.voting || connection !== "live"}
            />
          ) : (
          <VoteCard
            wide={wide}
            question={probe.vote.question}
            options={probe.vote.options}
            total={view.voteTotal}
            mine={player.voteChoice}
            leftS={view.voteLeftS}
            onVote={(i) => void castVote(i)}
            busy={player.voting || connection !== "live"}
          />
        );
        const orbit = view.orbit ? { at: probe.arrivedAt!, destName: view.destName, onCredits: openArrival } : null;
        // Today's fact about where we're going (E4b part 1), on legs whose stop has its facts.
        const destFile = view.fact && (
          <DestinationFile wide={wide} stop={probe.stop} destName={view.destName} fact={view.fact} leftS={view.factLeftS} />
        );

        if (!wide) {
          return (
            <main className="home" aria-label="Mission">
              <h1 className="visually-hidden">OneSmallClick mission control</h1>
              {invite}
              {burnCard}
              <ArrivalEstimate arrivalAt={view.arrivalAt} savedS={view.savedS} orbit={orbit} pace={view.pace} />
              {track}
              {signal}
              {askPing}
              <section className="home__thrust" aria-label="Thrust">
                <ThrustButton onThrust={onThrust} />
                <div className="home__rates">
                  <span className="num">
                    +{kmMiFine(view.tapKm)} <small>per tap</small>
                  </span>
                  <span className="num">
                    +{speedKmMi(view.autoKmS)} <small>auto</small>
                  </span>
                </div>
                {clicks}
                <button type="button" className="home__afford" onClick={openUpgrades} aria-haspopup="dialog">
                  {view.affordable} upgrades affordable · {int(player.credits)} cr
                </button>
              </section>
              <div className="home__spacer" aria-hidden="true" />
              {vote}
              {destFile}
              {switches.ads && <AdSlot width={320} height={50} />}
            </main>
          );
        }

        return (
          <main className="home home--wide" aria-label="Mission">
            <h1 className="visually-hidden">OneSmallClick mission control</h1>
            {invite}
            {burnCard}
            <div className="home__top">
              <ArrivalEstimate wide arrivalAt={view.arrivalAt} savedS={view.savedS} orbit={orbit} pace={view.pace} />
              <dl className="home__stats">
                <div>
                  <dt>TRAVELLED</dt>
                  <dd className="num">{kmMi(probe.distanceKm)}</dd>
                </div>
                <div>
                  <dt>PROBE SPEED</dt>
                  <dd className="num">{probeSpeed(view.speedKmS, view.moonLeg)}</dd>
                </div>
                <div>
                  <dt>TO GO</dt>
                  <dd className="num">{kmMi(view.toGoKm)}</dd>
                </div>
              </dl>
            </div>
            {track}
            <div className="home__columns">
              {signal}
              <section className="home__thrust home__thrust--wide" aria-label="Thrust">
                <ThrustButton onThrust={onThrust} size="lg" hint="click or press space" spaceKey />
                <div className="home__rates">
                  <span className="num">
                    +{kmMiFine(view.tapKm)} <small>per click</small>
                  </span>
                  <span className="num">
                    +{speedKmMi(view.autoKmS)} <small>auto-thrust</small>
                  </span>
                </div>
                {clicks}
                <button type="button" className="home__upgrades" onClick={openUpgrades} aria-haspopup="dialog">
                  <PixelIcon name="bolt" size={18} tone="blue" />
                  Upgrades · {view.affordable} affordable · {int(player.credits)} cr
                </button>
              </section>
              <div className="home__side">
                {askPing}
                {vote}
                {destFile}
              </div>
            </div>
            {switches.ads && (
              <div className="home__ad">
                <AdSlot wide width={728} height={90} />
              </div>
            )}
          </main>
        );
      }}
    </GameShell>
  );
}
