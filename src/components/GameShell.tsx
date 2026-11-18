import { useState, type ReactNode } from "react";
import { buyUpgrade, useGame } from "../game/fakeStore";
import { Link } from "../router";
import { STILLS } from "../sprites";
import { useTheme } from "../theme";
import { WIDE_QUERY, useMediaQuery } from "../useMediaQuery";
import { HereNow } from "./GameCards";
import { PixelIcon } from "./PixelIcon";
import { Sky } from "./Sky";
import { UpgradesSheet } from "./UpgradesSheet";
import "./GameShell.css";
import "./PixelButton.css";

export type GameTab = "mission" | "log" | "ranks" | "other";

interface GameShellProps {
  tab: GameTab;
  children: (ctx: { wide: boolean; openUpgrades: () => void }) => ReactNode;
}

/** The frame around every game page: sky, header, content, and on phones the tab bar. */
export function GameShell({ tab, children }: GameShellProps) {
  const wide = useMediaQuery(WIDE_QUERY);
  const [upgradesOpen, setUpgradesOpen] = useState(false);
  const { probe, player, view } = useGame();
  const openUpgrades = () => setUpgradesOpen(true);

  return (
    <>
      <Sky fixed />
      <div className={wide ? "game game--wide" : "game"}>
        <div className="game__main">
          <header className={wide ? "game-head game-head--wide" : "game-head"}>
            <div className="game-head__brand">
              <p className="game-head__title">
                <Link href="/">OneSmallClick</Link>
              </p>
              <p className="game-head__sub">Probe OSC-1 · Mission day {view.missionDay}</p>
            </div>
            {wide ? (
              <nav className="game-nav" aria-label="Game">
                <HereNow online={probe.online} idling={probe.idling} wide />
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
                <Link href="/sign-in" className="pbtn pbtn--blue game-nav__signin">
                  Sign in
                </Link>
              </nav>
            ) : (
              <HereNow online={probe.online} idling={probe.idling} />
            )}
          </header>

          {children({ wide, openUpgrades })}

          {!wide && (
            <footer className="game-foot">
              <Link href="/how-to-play">How to play</Link>
              <Link href="/log">Mission log</Link>
              <Link href="/sign-in">Sign in</Link>
              <ThemeLink />
            </footer>
          )}
        </div>

        {!wide && (
          <nav className="tabbar" aria-label="Game">
            <Link href="/" className="tabbar__item" aria-current={tab === "mission" ? "page" : undefined}>
              <img src={STILLS.earthSmall.src} alt="" width={16} height={16} />
              Mission
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

      <UpgradesSheet
        open={upgradesOpen}
        onClose={() => setUpgradesOpen(false)}
        credits={player.credits}
        lifetimeKm={player.lifetimeKm}
        view={view}
        onBuy={buyUpgrade}
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
