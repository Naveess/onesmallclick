import { yourTime } from "../game/format";
import { withMiles } from "../../shared/units";
import { landingPostcardOf, postcardBySlug } from "../../shared/postcards";
import { PostcardPhoto } from "../components/PostcardPhoto";
import { useEffect, useRef, useState } from "react";
import { GameShell } from "../components/GameShell";
import { PixelButton } from "../components/PixelButton";
import { PixelIcon } from "../components/PixelIcon";
import type { IconName } from "../components/iconPaths";
import { useGame } from "../game/store";
import { useDocumentTitle } from "./useDocumentTitle";
import "./LogPage.css";

// /log: the mission log (1h). Everything the crew has decided and seen, newest first.
// Entries come from GET /api/log; the open vote at the top comes from the live probe.

interface Entry {
  id: number;
  at: number;
  /** The day of its own leg (phase 8c: the log covers the whole tour). */
  day?: number | null;
  kind: string;
  title: string;
  body: string;
  data: { fact?: string; source?: string; slug?: string; postcard?: number; stop?: string; burn?: { ok: boolean } | null } | null;
}

interface Look {
  label: string;
  icon: IconName;
  tone: "blue" | "orange";
}

const LOOKS: Record<string, Look> = {
  vote_open: { label: "VOTE OPEN", icon: "check", tone: "blue" },
  vote_result: { label: "VOTE RESULT", icon: "check", tone: "blue" },
  signal_lost: { label: "SIGNAL", icon: "signal", tone: "orange" },
  signal_restored: { label: "SIGNAL", icon: "signal", tone: "orange" },
  close_save: { label: "SIGNAL", icon: "signal", tone: "orange" },
  milestone: { label: "MILESTONE", icon: "star", tone: "orange" },
  goal: { label: "CREW GOAL", icon: "trophy", tone: "orange" },
  arrival: { label: "ARRIVAL", icon: "star", tone: "orange" },
  branch_open: { label: "ROUTE VOTE", icon: "check", tone: "blue" },
  branch_result: { label: "ROUTE VOTE", icon: "check", tone: "blue" },
  leg_start: { label: "NEW LEG", icon: "up", tone: "blue" },
  burn_start: { label: "LANDING BURN", icon: "bolt", tone: "orange" },
  launch: { label: "LAUNCH", icon: "up", tone: "orange" },
};
const FALLBACK: Look = { label: "LOG", icon: "log", tone: "blue" };

async function fetchLog(before?: number): Promise<{ entries: Entry[]; more: boolean }> {
  const res = await fetch(`/api/log${before ? `?before=${before}` : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`log ${res.status}`);
  return res.json();
}

/** "Burn hard, hold steady, or a detour for a photo." from today's three options. */
function optionsLine(labels: string[]): string {
  const short = labels.map((l) => {
    const head = l.split(":")[0].trim();
    return head.charAt(0).toLowerCase() + head.slice(1);
  });
  if (short.length < 2) return short.join("");
  const list = `${short.slice(0, -1).join(", ")}, or ${short[short.length - 1]}`;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

export function LogPage() {
  useDocumentTitle("Mission log · OneSmallClick");
  const { probe, view, now } = useGame();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loaded = useRef(-1);
  const first = useRef(true);

  // Load on open, and again whenever the probe says there's a newer entry.
  useEffect(() => {
    if (loaded.current === probe.logId && entries) return;
    let gone = false;
    fetchLog()
      .then((page) => {
        if (gone) return;
        loaded.current = probe.logId;
        setError(false);
        setEntries((old) => {
          const byId = new Map((old ?? []).map((e) => [e.id, e]));
          for (const e of page.entries) byId.set(e.id, e);
          return [...byId.values()].sort((a, b) => b.id - a.id);
        });
        if (loaded.current === -1 || first.current) setMore(page.more);
        first.current = false;
      })
      .catch(() => !gone && setError(true));
    return () => {
      gone = true;
    };
  }, [probe.logId]);

  const loadOlder = async () => {
    if (!entries?.length) return;
    setLoadingMore(true);
    try {
      const page = await fetchLog(entries[entries.length - 1].id);
      setEntries([...entries, ...page.entries.filter((e) => !entries.some((x) => x.id === e.id))]);
      setMore(page.more);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  const vote = probe.vote;
  const open: Entry | null =
    vote.options.length > 0
      ? {
          id: 0,
          at: now, // it's open today
          kind: "vote_open",
          title: vote.question,
          body: `${optionsLine(vote.options.map((o) => o.label))}. Closes ${yourTime(vote.closesAt)}.`,
          data: null,
        }
      : null;
  const shown = [...(open ? [open] : []), ...(entries ?? [])];

  return (
    <GameShell tab="log">
      {({ wide }) => (
        <main className={wide ? "log log--wide" : "log"} aria-labelledby="log-title">
          <header className="log__head">
            <PixelIcon name="log" size={27} tone="blue" />
            <div>
              <h1 id="log-title" className="log__title">
                Mission log
              </h1>
              <p className="log__sub">Everything the crew has decided and seen</p>
            </div>
          </header>

          <ol className="log__list">
            {shown.map((e) => {
              const look = LOOKS[e.kind] ?? FALLBACK;
              return (
                <li key={e.id} className={`log__entry log__entry--${look.tone}`}>
                  <span className="log__marker" aria-hidden="true">
                    <PixelIcon name={look.icon} size={9} tone={look.tone} />
                  </span>
                  <p className="log__meta">
                    <span className="log__day num">DAY {e.day ?? view.missionDayAt(e.at)}</span>
                    <span className="log__kind">{look.label}</span>
                  </p>
                  <h2 className="log__entry-title">{withMiles(e.title)}</h2>
                  <p className="log__body">{withMiles(e.body)}</p>
                  {e.kind === "milestone" && e.data?.postcard && (
                    <div className="log__postcard" aria-hidden="true">
                      <div className="log__postcard-photo">
                        {e.data.slug && postcardBySlug(e.data.slug) ? (
                          <PostcardPhoto photo={postcardBySlug(e.data.slug)!} lazy credit={false} />
                        ) : (
                          `POSTCARD ${String(e.data.postcard).padStart(2, "0")}`
                        )}
                      </div>
                    </div>
                  )}
                  {e.kind === "arrival" && e.data?.burn && (
                    // The landing burn's postcard (E4b part 2b): a gold frame when the crew stuck the landing.
                    <div className={e.data.burn.ok ? "log__postcard log__postcard--gold" : "log__postcard"} aria-hidden="true">
                      <div className="log__postcard-photo">
                        {e.data.stop && landingPostcardOf(e.data.stop) && <PostcardPhoto photo={landingPostcardOf(e.data.stop)!} lazy credit={false} />}
                        <span className="log__postcard-label">{e.data.burn.ok ? "GOLD EDITION" : "TOUCHDOWN"}</span>
                      </div>
                    </div>
                  )}
                  {e.kind === "milestone" && e.data?.slug && (
                    <a className="log__more" href={`/milestones/${e.data.slug}`}>
                      Read more about this milestone →
                    </a>
                  )}
                  {e.data?.fact && (
                    <p className="log__fact">
                      <span className="log__fact-label">FROM THE FLIGHT DECK</span> {withMiles(e.data.fact)}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          {entries === null && !error && <p className="log__note">Loading the log…</p>}
          {entries !== null && entries.length === 0 && (
            <p className="log__note">Nothing else in the log yet. Today's vote result lands here at {yourTime(vote.closesAt)}.</p>
          )}
          {error && (
            <p className="log__note" role="alert">
              Couldn't load the log. It will try again when something new happens.
            </p>
          )}
          {more && (
            <PixelButton variant="outline" onClick={() => void loadOlder()} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Older entries"}
            </PixelButton>
          )}
        </main>
      )}
    </GameShell>
  );
}
