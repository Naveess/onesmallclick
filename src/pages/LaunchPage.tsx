import { Sky } from "../components/Sky";
import { Sprite } from "../components/Sprite";
import { ThemeToggle } from "../components/ThemeToggle";
import { Window } from "../components/Window";
import { SPRITES } from "../sprites";
import { useDocumentTitle } from "./useDocumentTitle";
import "./LaunchPage.css";

/** "/" until the game home arrives in phase 3. */
export function LaunchPage() {
  useDocumentTitle("OneSmallClick: launching soon");
  return (
    <>
      <Sky fixed />
      <div className="launch">
        <header className="launch__bar">
          <ThemeToggle />
        </header>
        <main className="launch__main">
          <Window as="section" className="launch__card" aria-labelledby="launch-title">
            <Sprite sprite={SPRITES.thruster} scale={2} bob label="Pixel-art probe OSC-1 with its thruster firing" />
            <h1 id="launch-title" className="launch__title">
              OneSmallClick: <span>launching soon</span>
            </h1>
            <p className="launch__lede">The whole world flies one real probe to Mars, one small click at a time.</p>
          </Window>
        </main>
      </div>
    </>
  );
}
