import { AdSlot, ArrivalEstimate, SignalCard, VoteCard } from "../components/GameCards";
import { GameShell } from "../components/GameShell";
import { JourneyTrack } from "../components/JourneyTrack";
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
  const { probe, player, view } = useGame();

  return (
    <GameShell tab="mission">
      {({ wide, openUpgrades }) => {
        const track = (
          <JourneyTrack
            wide={wide}
            progress={view.progress}
            distanceKm={probe.distanceKm}
            routeKm={probe.routeKm}
            milestones={MILESTONES}
            nextMilestone={view.nextMilestone}
            toNextKm={view.toNextKm}
          />
        );
        const signal = (
          <SignalCard
            wide={wide}
            leftS={view.signalLeftS}
            urgent={view.signalUrgent}
            pinged={player.pingedToday}
            streakDays={player.pingStreakDays}
            onPing={ping}
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
            onVote={castVote}
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
                <ThrustButton onThrust={thrust} />
                <div className="home__rates">
                  <span className="num">
                    +{view.tapKm} km <small>per tap</small>
                  </span>
                  <span className="num">
                    +{view.autoKmS.toFixed(2)} km/s <small>auto</small>
                  </span>
                </div>
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
                <ThrustButton onThrust={thrust} size="lg" hint="click or press space" spaceKey />
                <div className="home__rates">
                  <span className="num">
                    +{view.tapKm} km <small>per click</small>
                  </span>
                  <span className="num">
                    +{view.autoKmS.toFixed(2)} km/s <small>auto-thrust</small>
                  </span>
                </div>
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
