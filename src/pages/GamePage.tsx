import { useRef } from "react";
import { ClickCounter } from "../components/ClickCounter";
import { FlightView, type FlightHandle } from "../components/FlightView";
import { AdSlot, ArrivalEstimate, SignalCard, VoteCard } from "../components/GameCards";
import { GameShell } from "../components/GameShell";
import { SafeMode } from "../components/SafeMode";
import { PixelIcon } from "../components/PixelIcon";
import { ThrustButton } from "../components/ThrustButton";
import { castVote, ping, switches, thrust, useGame } from "../game/store";
import { int } from "../game/format";
import { MILESTONES } from "../game/rules";
import { useDocumentTitle } from "./useDocumentTitle";
import "./GamePage.css";

/** "/": the game home (1a phone, 1b wide), the shared probe is live from phase 4 (store.ts says what is still fake). */
export function GamePage() {
  useDocumentTitle("OneSmallClick · push one probe to Mars together");
  const { probe, player, view, connection } = useGame();
  const flight = useRef<FlightHandle>(null);
  // THRUST also boosts the probe in the flight view, with its "+km".
  const onThrust = () => {
    const km = thrust();
    flight.current?.boost(km);
    return km;
  };

  return (
    <GameShell tab="mission">
      {({ wide, openUpgrades }) => {
        if (view.safe) {
          return (
            <SafeMode
              wide={wide}
              quietS={view.quietS}
              arrivalAt={view.arrivalAt}
              arrivalBeforeAt={view.arrivalBeforeAt}
              setbackMs={view.setbackMs}
              paused={view.paused}
              progress={view.progress}
              pinged={player.pingedToday}
              pinging={player.pinging}
              onPing={() => void ping()}
            />
          );
        }

        // The flight view replaces JourneyTrack (prompt 32); JourneyTrack.tsx stays until the flight view is approved.
        const track = (
          <FlightView
            handle={flight}
            wide={wide}
            progress={view.progress}
            distanceKm={probe.distanceKm}
            routeKm={probe.routeKm}
            speedKmS={view.speedKmS}
            crewKmS={probe.crewKmS}
            online={probe.online}
            handful={switches.handful}
            arrivalAt={view.arrivalAt}
            milestones={MILESTONES}
            nextMilestone={view.nextMilestone}
            toNextKm={view.toNextKm}
            safe={view.safe}
            urgent={view.signalUrgent}
            signalLeftS={view.signalLeftS}
            paused={view.paused}
          />
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
        const vote = (
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

        if (!wide) {
          return (
            <main className="home" aria-label="Mission">
              <h1 className="visually-hidden">OneSmallClick mission control</h1>
              <ArrivalEstimate arrivalAt={view.arrivalAt} savedS={view.savedS} />
              {track}
              {signal}
              <section className="home__thrust" aria-label="Thrust">
                <ThrustButton onThrust={onThrust} />
                <div className="home__rates">
                  <span className="num">
                    +{view.tapKm} km <small>per tap</small>
                  </span>
                  <span className="num">
                    +{view.autoKmS.toFixed(2)} km/s <small>auto</small>
                  </span>
                </div>
                {clicks}
                <button type="button" className="home__afford" onClick={openUpgrades} aria-haspopup="dialog">
                  {view.affordable} upgrades affordable · {int(player.credits)} cr
                </button>
              </section>
              <div className="home__spacer" aria-hidden="true" />
              {vote}
              {switches.ads && <AdSlot width={320} height={50} />}
            </main>
          );
        }

        return (
          <main className="home home--wide" aria-label="Mission">
            <h1 className="visually-hidden">OneSmallClick mission control</h1>
            <div className="home__top">
              <ArrivalEstimate wide arrivalAt={view.arrivalAt} savedS={view.savedS} />
              <dl className="home__stats">
                <div>
                  <dt>TRAVELLED</dt>
                  <dd className="num">{int(probe.distanceKm)} km</dd>
                </div>
                <div>
                  <dt>PROBE SPEED</dt>
                  <dd className="num">{view.speedKmS.toFixed(2)} km/s</dd>
                </div>
                <div>
                  <dt>TO GO</dt>
                  <dd className="num">{int(view.toGoKm)} km</dd>
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
                    +{view.tapKm} km <small>per click</small>
                  </span>
                  <span className="num">
                    +{view.autoKmS.toFixed(2)} km/s <small>auto-thrust</small>
                  </span>
                </div>
                {clicks}
                <button type="button" className="home__upgrades" onClick={openUpgrades} aria-haspopup="dialog">
                  <PixelIcon name="bolt" size={18} tone="blue" />
                  Upgrades · {view.affordable} affordable · {int(player.credits)} cr
                </button>
              </section>
              {vote}
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
