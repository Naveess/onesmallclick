import { useEffect, useState } from "react";
import type { Board, BoardResult, BoardRow } from "../../shared/boards";
import { Flag } from "../components/Flag";
import { GameShell } from "../components/GameShell";
import { PixelIcon } from "../components/PixelIcon";
import { countryName } from "../game/countries";
import { int } from "../game/format";
import { Link } from "../router";
import { useDocumentTitle } from "./useDocumentTitle";
import "./RanksPage.css";

// /ranks: the leaderboards (1g, phase 8b). Km pushed today (UTC), players (signed in) and countries
// (everyone, for now). The server works out the top once a minute; this page asks again every minute.

const REFRESH_MS = 60_000;

async function fetchBoard(board: Board): Promise<BoardResult> {
  const res = await fetch(`/api/leaderboard?board=${board}`, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return res.json();
}

function rankClass(rank: number | null): string {
  if (rank === 1) return "ranks__rank ranks__rank--gold";
  if (rank !== null && rank <= 3) return "ranks__rank ranks__rank--top";
  return "ranks__rank";
}

function Row({ row, board }: { row: BoardRow; board: Board }) {
  return (
    <li className="ranks__row">
      <span className={rankClass(row.rank)}>{row.rank ?? "–"}</span>
      <Flag cc={row.cc} label={countryName(row.cc)} />
      <span className="ranks__name">{board === "countries" ? countryName(row.cc) : row.name}</span>
      <span className="ranks__km num">{int(row.km)} km</span>
    </li>
  );
}

export function RanksPage() {
  useDocumentTitle("Leaderboards · OneSmallClick");
  const [board, setBoard] = useState<Board>("players");
  const [data, setData] = useState<Partial<Record<Board, BoardResult>>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchBoard(board)
        .then((r) => {
          if (!alive) return;
          setData((d) => ({ ...d, [board]: r }));
          setError(false);
        })
        .catch(() => alive && setError(true));
    void load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [board]);

  const shown = data[board];
  const me = shown?.me ?? null;

  return (
    <GameShell tab="ranks">
      {({ wide }) => (
        <main className={wide ? "ranks ranks--wide" : "ranks"} aria-labelledby="ranks-title">
          <header className="ranks__head">
            <PixelIcon name="trophy" size={27} tone="orange" />
            <div>
              <h1 id="ranks-title" className="ranks__title">
                Leaderboards
              </h1>
              <p className="ranks__sub">Distance pushed today · resets 00:00 UTC</p>
            </div>
          </header>

          <div className="ranks__tabs" role="tablist" aria-label="Leaderboard">
            {(["players", "countries"] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={board === b}
                className={board === b ? "ranks__tab ranks__tab--on" : "ranks__tab"}
                onClick={() => setBoard(b)}
              >
                {b === "players" ? "Players" : "Countries"}
              </button>
            ))}
          </div>

          {!shown && !error && <p className="ranks__note">Loading…</p>}
          {error && !shown && <p className="ranks__note">We couldn't load the board. It tries again every minute.</p>}
          {shown && shown.rows.length === 0 && (
            <p className="ranks__note">
              {board === "players"
                ? "Nobody signed in has pushed yet today. Tap THRUST to be first."
                : "Nobody has pushed yet today."}
            </p>
          )}
          {shown && shown.rows.length > 0 && (
            <ol className="ranks__list" aria-label={board === "players" ? "Top players today" : "Top countries today"}>
              {shown.rows.map((r) => (
                <Row key={`${r.rank}-${r.name}`} row={r} board={board} />
              ))}
            </ol>
          )}

          {shown && me && (
            <Link href="/profile" className="ranks__me" aria-label="Your row: open your profile">
              {board === "players" && !shown.signedIn ? (
                <>
                  <span className="ranks__me-rank">–</span>
                  <Flag cc={me.cc} label={countryName(me.cc)} />
                  <span className="ranks__name">
                    {me.name} (you)
                    <span className="ranks__me-hint">Sign in to appear on the board</span>
                  </span>
                  <span className="ranks__km num">{int(me.km)} km</span>
                </>
              ) : (
                <>
                  <span className="ranks__me-rank num">{me.rank === null ? "–" : `#${int(me.rank)}`}</span>
                  <Flag cc={me.cc} label={countryName(me.cc)} />
                  <span className="ranks__name">
                    {board === "countries" ? `${countryName(me.cc)} (yours)` : `${me.name} (you)`}
                  </span>
                  <span className="ranks__km num">{int(me.km)} km</span>
                </>
              )}
            </Link>
          )}
          {shown && board === "players" && !shown.signedIn && (
            <p className="ranks__note">
              Only signed-in crew are on the Players board. <Link href="/sign-in">Sign in</Link> to join it; your progress comes with you.
            </p>
          )}
        </main>
      )}
    </GameShell>
  );
}
