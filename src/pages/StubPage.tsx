import { GameShell, type GameTab } from "../components/GameShell";
import { PixelIcon } from "../components/PixelIcon";
import { Window } from "../components/Window";
import type { IconName } from "../components/iconPaths";
import { Link } from "../router";
import { useDocumentTitle } from "./useDocumentTitle";
import "./StubPage.css";

interface StubPageProps {
  tab: GameTab;
  title: string;
  icon: IconName;
  /** What this page will be, and in which phase. */
  note: string;
}

/** A "coming soon" page inside the game frame, so the links already go to their final addresses. */
export function StubPage({ tab, title, icon, note }: StubPageProps) {
  useDocumentTitle(`${title} · OneSmallClick`);
  return (
    <GameShell tab={tab}>
      {() => (
        <main className="stub" aria-labelledby="stub-title">
          <Window className="stub__card">
            <PixelIcon name={icon} size={36} tone="blue" />
            <h1 id="stub-title" className="stub__title">
              {title}
            </h1>
            <p className="stub__soon">Coming soon</p>
            <p className="stub__note">{note}</p>
            <Link href="/" className="pbtn pbtn--blue">
              Back to the mission
            </Link>
          </Window>
        </main>
      )}
    </GameShell>
  );
}
