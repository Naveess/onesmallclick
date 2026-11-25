import { yourTime } from "../game/format";
import { miOnly } from "../../shared/units";
import { NUDGES, ctaLabel, fillNudge, signInHref } from "../game/nudges";
import { useEffect, useState } from "react";
import type { Board, BoardResult, BoardRow } from "../../shared/boards";
import { Flag } from "../components/Flag";
import { GameShell } from "../components/GameShell";
import { PixelIcon } from "../components/PixelIcon";
import { countryName } from "../game/countries";
import { int } from "../game/format";
import { useGame } from "../game/store";
import { Link } from "../router";
import { ShareNudge } from "../components/ShareNudge";
import { flagEmoji } from "../../shared/share";
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
      <span className="ranks__km num">
                {int(row.km)} km<span className="mi">{miOnly(row.km)}</span>
              </span>
    </li>
  );
}

/** Share your place (phase S1): your rank on the players board, or your country's against the one just above it. */
function RankShare({ board, rank, cc, rows }: { board: Board; rank: number; cc: string | null; rows: BoardRow[] }) {
  if (board === "players") {
    return <ShareNudge moment="rank" fill={{ rank }} label={`Share: I'm #${int(rank)} today`} title="Share your rank" />;
  }
  const rival = rows.find((r) => r.rank === rank - 1);
  const country = countryName(cc);
  return (
    <ShareNudge
      moment="country"
      fill={{ rank, country, flag: flagEmoji(cc), rival: rival ? countryName(rival.cc) : "", rivalFlag: flagEmoji(rival?.cc) }}
      alt={rank === 1 || !rival}
      label={`Rally ${country}`}
      title={`Rally ${country} on the countries board`}
    />
  );
}

export function RanksPage() {
  useDocumentTitle("Leaderboards · OneSmallClick");
  const { player } = useGame();
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
              <p className="ranks__sub">Distance pushed today · resets {yourTime((Math.floor(Date.now() / 86_400_000) + 1) * 86_400_000)}</p>
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

          {shown && me && board === "players" && !shown.signedIn ? (
            // Phase G1: the ghost row, where a guest would rank if they signed in.
            <Link href={signInHref("ghost")} className="ranks__me ranks__me--ghost" aria-label="Sign in to claim your spot on the board">
              <span className="ranks__me-rank num">{shown.ghostRank ? `#${int(shown.ghostRank)}` : "–"}</span>
              <Flag cc={me.cc} label={countryName(me.cc)} />
              <span className="ranks__name">
                {me.name} (you)
                <span className="ranks__me-hint">
                  {shown.ghostRank ? fillNudge(NUDGES.ghost, { rank: int(shown.ghostRank) }) : NUDGES.ghostZero}
                </span>
              </span>
              <span className="ranks__km num">
                {int(me.km)} km<span className="mi">{miOnly(me.km)}</span>
              </span>
            </Link>
          ) : shown && me && (
            <Link href="/profile" className="ranks__me" aria-label="Your row: open your profile">
              <span className="ranks__me-rank num">{me.rank === null ? "–" : `#${int(me.rank)}`}</span>
              <Flag cc={me.cc} label={countryName(me.cc)} />
              <span className="ranks__name">
                {board === "countries" ? `${countryName(me.cc)} (yours)` : `${me.name} (you)`}
              </span>
              <span className="ranks__km num">
                {int(me.km)} km<span className="mi">{miOnly(me.km)}</span>
              </span>
            </Link>
          )}
          {shown && me && me.rank !== null && (board === "countries" ? me.cc !== null : shown.signedIn) && (
            <RankShare board={board} rank={me.rank} cc={me.cc} rows={shown.rows} />
          )}
          {shown && board === "players" && !shown.signedIn && (
            <p className="ranks__note">
              Only signed-in crew are on the Players board. <Link href={signInHref("ghost")}>{ctaLabel(player.emailSignIn)}</Link> to join it; your
              progress comes with you.
            </p>
          )}
          {shown && board === "countries" && !shown.signedIn && (
            // Phase G1 (prompt 91): the countries board counts signed-in crew only.
            <p className="ranks__note">
              {fillNudge(NUDGES.countries, { country: me?.cc ? countryName(me.cc) : "your country" })}{" "}
              <Link href={signInHref("countries")}>{ctaLabel(player.emailSignIn)}</Link>
            </p>
          )}
        </main>
      )}
    </GameShell>
  );
}
