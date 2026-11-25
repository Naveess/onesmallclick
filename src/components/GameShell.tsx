import { useState, type ReactNode } from "react";
import { buyUpgrade, dismissArrival, dismissMoment, dismissWelcome, handOver, useGame } from "../game/store";
import { ArrivalScreen } from "./ArrivalScreen";
import { BetaBanner } from "./BetaBanner";
import { Link } from "../router";
import { STILLS } from "../sprites";
import { useTheme } from "../theme";
import { WIDE_QUERY, useMediaQuery } from "../useMediaQuery";
import { HereNow, SafeChip } from "./GameCards";
import { PixelIcon } from "./PixelIcon";
import { Sky } from "./Sky";
import { Toast } from "./Toast";
import { UpgradesSheet } from "./UpgradesSheet";
import { MilestoneMoment } from "./MilestoneMoment";
import { NewProbeReveal, useProbeReveal } from "./NewProbeReveal";
import { WelcomeBack } from "./WelcomeBack";
import "./GameShell.css";
import "./PixelButton.css";

export type GameTab = "mission" | "map" | "log" | "ranks" | "other";

interface GameShellProps {
  tab: GameTab;
  children: (ctx: { wide: boolean; openUpgrades: () => void }) => ReactNode;
}

/** The frame around every game page: sky, header, content, and on phones the tab bar. */
export function GameShell({ tab, children }: GameShellProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [upgradesOpen, setUpgradesOpen] = useState(false);
  const { probe, player, view, toast, welcome, moment, arrival, connection, now, ready } = useGame();
  const safe = view.safe;
  const reveal = useProbeReveal(ready, view.probeId, probe.stop);
  const openUpgrades = () => setUpgradesOpen(true);

  if (welcome) {
    return (
      <>
        <Sky fixed />
        <div className={wide ? "game game--wide" : "game"}>
          <div className="game__main">
            <WelcomeBack welcome={welcome} name={player.name} wide={wide} onClose={dismissWelcome} />
          </div>
        </div>
      </>
    );
  }

  if (arrival) {
    return (
      <>
        <Sky fixed milestone />
        <div className={wide ? "game game--wide" : "game"}>
          <div className="game__main">
            <ArrivalScreen arrival={arrival} wide={wide} onClose={dismissArrival} />
          </div>
        </div>
        <Toast toast={toast} wide={wide} />
      </>
    );
  }

  if (moment) {
    return (
      <>
        <Sky fixed milestone />
        <div className={wide ? "game game--wide" : "game"}>
          <div className="game__main">
            <MilestoneMoment
              reached={moment}
              stopId={moment.stop}
              wide={wide}
              missionDay={moment.missionId === probe.missionId ? view.missionDayAt(moment.at) : null}
              today={{
                missionDay: view.missionDay,
                destName: view.destName,
                progress: view.progress,
                kmToday: player.kmToday,
                arrivalAt: view.arrivalAt,
                now,
              }}
              onClose={dismissMoment}
            />
          </div>
        </div>
        <Toast toast={toast} wide={wide} />
      </>
    );
  }

  if (reveal.show) {
    return (
      <>
        <Sky fixed />
        <div className={wide ? "game game--wide" : "game"}>
          <div className="game__main">
            <NewProbeReveal probeId={view.probeId} beforeId={reveal.beforeId} stopId={probe.stop} wide={wide} onClose={reveal.done} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Sky fixed safe={safe} />
      <div className={wide ? "game game--wide" : "game"}>
        <div className="game__main">
          <header className={["game-head", wide && "game-head--wide", safe && "game-head--safe"].filter(Boolean).join(" ")}>
            <div className="game-head__brand">
              <p className="game-head__title">
                <Link href="/">OneSmallClick</Link>
              </p>
              <p className="game-head__sub">
                Probe {view.probeTag} · Mission day {view.missionDay}
              </p>
            </div>
            {wide ? (
              <nav className="game-nav" aria-label="Game">
                {safe ? <SafeChip /> : <HereNow online={probe.online} idling={probe.idling} wide />}
                <Link href="/map" className="game-nav__item" aria-current={tab === "map" ? "page" : undefined}>
                  <PixelIcon name="map" size={18} tone={tab === "map" ? "blue" : "muted"} />
                  Map
                </Link>
                <button type="button" className="game-nav__item" onClick={openUpgrades} aria-haspopup="dialog">
                  <PixelIcon name="bolt" size={18} tone="muted" />
                  Upgrades
                </button>
                <Link href="/log" className="game-nav__item" aria-current={tab === "log" ? "page" : undefined}>
                  <PixelIcon name="log" size={18} tone="muted" />
                  Log
                </Link>
                <Link href="/ranks" className="game-nav__item" aria-current={tab === "ranks" ? "page" : undefined}>
                  <PixelIcon name="trophy" size={18} tone="muted" />
                  Ranks
                </Link>
                <Link href="/how-to-play" className="game-nav__item">
                  How to play
                </Link>
                <ThemeLink className="game-nav__item" />
                <Link href={player.account ? "/profile" : "/sign-in"} className="pbtn pbtn--blue game-nav__signin">
                  {player.account ? player.name : "Sign in"}
                </Link>
              </nav>
            ) : (
              <div className="game-head__side">
                {safe ? <SafeChip /> : <HereNow online={probe.online} idling={probe.idling} />}
                {/* Prompt 42: the profile, one tap away on phones (the name button does this on wide screens). */}
                <Link href="/profile" className="game-head__profile" aria-label="Your profile">
                  <PixelIcon name="user" size={18} tone="blue" />
                </Link>
              </div>
            )}
          </header>

          <BetaBanner signedIn={!!player.account} hasBadge={player.badges.some((b) => b.id === "early-beta")} safe={safe} />

          {children({ wide, openUpgrades })}

          {!wide ? (
            <footer className="game-foot">
              <Link href="/how-to-play">How to play</Link>
              <Link href="/log">Mission log</Link>
              <Link href="/profile">Profile</Link>
              <Link href="/sign-in">{player.account ? "Account" : "Sign in"}</Link>
              <ThemeLink />
              {/* Phase 9a: the legal pages, linked from every page. */}
              <span className="game-foot__legal">
                <Link href="/privacy">Privacy</Link>
                <Link href="/terms">Terms</Link>
                <Link href="/contact">Contact</Link>
              </span>
            </footer>
          ) : (
            <footer className="game-foot game-foot--wide">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/contact">Contact</Link>
            </footer>
          )}
        </div>

        {!wide && (
          <nav className="tabbar" aria-label="Game">
            <Link href="/" className="tabbar__item" aria-current={tab === "mission" ? "page" : undefined}>
              <img src={STILLS.earthSmall.src} alt="" width={16} height={16} />
              Mission
            </Link>
            <Link href="/map" className="tabbar__item" aria-current={tab === "map" ? "page" : undefined}>
              <PixelIcon name="map" size={18} tone={tab === "map" ? "blue" : "muted"} />
              Map
            </Link>
            <button type="button" className="tabbar__item" onClick={openUpgrades} aria-haspopup="dialog">
              <PixelIcon name="bolt" size={18} tone="muted" />
              Upgrades
            </button>
            <Link href="/log" className="tabbar__item" aria-current={tab === "log" ? "page" : undefined}>
              <PixelIcon name="log" size={18} tone={tab === "log" ? "blue" : "muted"} />
              Log
            </Link>
            <Link href="/ranks" className="tabbar__item" aria-current={tab === "ranks" ? "page" : undefined}>
              <PixelIcon name="trophy" size={18} tone={tab === "ranks" ? "blue" : "muted"} />
              Ranks
            </Link>
          </nav>
        )}
      </div>

      <Toast toast={toast} wide={wide} />

      <UpgradesSheet
        open={upgradesOpen}
        onClose={() => setUpgradesOpen(false)}
        player={player}
        live={connection === "live"}
        view={view}
        onBuy={buyUpgrade}
        onHandOver={handOver}
      />
    </>
  );
}

/** The theme switch as a quiet text link, for the game's header and footer. */
function ThemeLink({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className={className} onClick={toggle} aria-label={`Switch to ${next} mode`}>
      {next === "light" ? "Light mode" : "Dark mode"}
    </button>
  );
}
