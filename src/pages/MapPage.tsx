import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { branchStopId, legKm, probeFor, stopName, type Stop } from "../../shared/campaign";
import type { TourInfo, TourLeg } from "../../shared/boards";
import { MEDAL_NAMES, SILVER_DAYS, type Medal } from "../../shared/medals";
import { GameShell } from "../components/GameShell";
import { PixelButton } from "../components/PixelButton";
import { PixelIcon } from "../components/PixelIcon";
import { ShareNudge } from "../components/ShareNudge";
import { Sprite } from "../components/Sprite";
import { factCount, firstFact } from "../game/facts";
import { int } from "../game/format";
import { beltArt, kuiperArt, probeRingArt, stopArt } from "../game/mapArt";
import { layout, mapModel, phoneGeometry, rowOf, wideGeometry, type StopState, type StopView } from "../game/mapLayout";
import { medalArt } from "../game/rewardArt";
import { castVote, useGame } from "../game/store";
import { Link } from "../router";
import { probeStill } from "../sprites";
import { useDocumentTitle } from "./useDocumentTitle";
import "./MapPage.css";

/** The legs flown so far (GET /api/tour), fetched again after each arrival. */
function useTour(arrivals: number): TourLeg[] {
  const [legs, setLegs] = useState<TourLeg[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/tour", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<TourInfo>) : { legs: [] }))
      .then((t) => alive && setLegs(t.legs))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [arrivals]);
  return legs;
}

/** Only this tour's legs: the ones before the current mission, from the last time the probe left Earth
 * (an /admin reset or the launch reset starts the tour again; older arrivals stay in D1). */
function thisTour(legs: TourLeg[], missionId: number, fromStop: string, orbit: boolean): TourLeg[] {
  const done = legs.filter((l) => l.missionId < missionId || (orbit && l.missionId === missionId));
  if (fromStop === "earth") return done.filter((l) => l.missionId === missionId);
  let start = -1;
  done.forEach((l, i) => {
    if (l.fromStop === "earth") start = i;
  });
  return start < 0 ? done : done.slice(start);
}

/** "1.07M km", "671,100 km", "186M km", "1.44B km". */
function distance(km: number): string {
  if (km >= 1e9) return `${(km / 1e9).toFixed(2)}B km`;
  if (km >= 1e7) return `${Math.round(km / 1e6)}M km`;
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  return `${int(km)} km`;
}

const dateOf = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** How far from the stop before, for the card: the branch actually flown when there were two ways in. */
function distanceLine(s: Stop, flownFrom: string | null): string {
  if (s.kind === "start") return "Start of the journey";
  const froms = Array.isArray(s.from) ? s.from : s.from ? [s.from] : [];
  const from = flownFrom && froms.includes(flownFrom) ? flownFrom : froms.length === 1 ? froms[0] : null;
  if (from) {
    const km = legKm(from, s.id);
    return km === null ? `Distance from ${stopName(from)} not charted yet` : `${distance(km)} from ${stopName(from)}`;
  }
  const kms = froms.map((f) => legKm(f, s.id)).filter((k): k is number => k !== null);
  if (kms.length < froms.length || kms.length === 0) return "Distance not charted yet";
  const lo = Math.min(...kms);
  const hi = Math.max(...kms);
  const where = froms.map(stopName).join(" or ");
  return lo === hi ? `${distance(lo)} from ${where}` : `${distance(lo)}–${distance(hi)} from ${where}`;
}

const KICKER: Record<StopState, string> = {
  visited: "VISITED",
  next: "NEXT STOP",
  vote: "CREW VOTE · PICK ONE",
  teaser: "THE ROUTE SPLITS HERE NEXT",
  future: "FUTURE STOP",
  skip: "NOT TAKEN",
};

export function MapPage() {
  useDocumentTitle("Campaign map · OneSmallClick");
  const { probe, player, view } = useGame();
  const legs = thisTour(useTour(probe.lastArrival?.missionId ?? 0), probe.missionId, probe.fromStop, probe.arrivedAt !== null);
  const [selected, setSelected] = useState<string | null>(null);
  const [techOpen, setTechOpen] = useState(false);

  const voteStops = probe.vote.kind === "branch" ? probe.vote.options.map((o) => branchStopId(o.id) ?? "") : [];
  const model = useMemo(
    () => mapModel(legs, { stop: probe.stop, fromStop: probe.fromStop, progress: view.progress, orbit: view.orbit, voteStops }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [legs, probe.stop, probe.fromStop, Math.round(view.progress * 400), view.orbit, voteStops.join()],
  );
  const flyingProbe = probeFor(probe.stop, probe.fromStop);
  const legDay = Math.max(1, view.missionDay);
  const pct = Math.min(99, Math.floor(view.progress * 100));

  // Crew tech: every planet tech unlocked by an arrival, at its medal.
  const tech = [...model.stops.values()].filter((v) => v.state === "visited" && v.stop.tech && v.medal);

  const subline = view.orbit
    ? `${flyingProbe?.name.split(" ")[0] ?? "OSC-1"} · in orbit at ${view.destName}${probe.vote.kind === "branch" ? " · crew vote open" : ""}`
    : `${flyingProbe?.name.split(" ")[0] ?? "OSC-1"} · Day ${legDay} of ~${SILVER_DAYS} to ${view.destName}`;

  const close = () => {
    setSelected(null);
    setTechOpen(false);
  };

  return (
    <GameShell tab="map">
      {({ wide }) => (
        <main className={wide ? "map map--wide" : "map"} aria-labelledby="map-title">
          <header className="map__head">
            <div className="map__titles">
              <p className="map__kicker">{wide ? "STAR CHART · THE WHOLE JOURNEY" : "STAR CHART"}</p>
              <h1 id="map-title" className="map__title">
                Campaign map
              </h1>
              <p className="map__sub num">{subline}</p>
            </div>
            <div className="map__actions">
              <ShareNudge
                moment="map"
                detail={String(pct)}
                fill={{ pct, dest: view.destName }}
                alt={view.orbit}
                label="Share the map"
                title="Share the map"
                block={false}
              />
              <PixelButton
                variant="outline"
                className="map__tech-btn"
                aria-haspopup="dialog"
                aria-expanded={techOpen}
                onClick={() => {
                  setSelected(null);
                  setTechOpen((o) => !o);
                }}
                icon={<PixelIcon name="bolt" size={18} tone="blue" />}
              >
                Crew tech · {tech.length}
              </PixelButton>
            </div>
          </header>

          <Chart
            wide={wide}
            model={model}
            selected={selected}
            onPick={(id) => {
              setTechOpen(false);
              setSelected((s) => (s === id ? null : id));
            }}
            probeSrc={probeStill(flyingProbe?.id ?? "pathfinder")}
            probeLabel={`${flyingProbe?.name ?? "Probe OSC-1"}, ${view.orbit ? `in orbit at ${view.destName}` : `${pct}% of the way to ${view.destName}`}`}
            dayChip={view.orbit ? "In orbit" : `Day ${legDay} of ~${SILVER_DAYS}`}
            voteShare={(id) => {
              const i = voteStops.indexOf(id);
              const total = view.voteTotal;
              return i < 0 || total === 0 ? 0 : Math.round((probe.vote.options[i].votes / total) * 100);
            }}
          />

          {selected && model.stops.get(selected) && (
            <StopCard
              wide={wide}
              v={model.stops.get(selected)!}
              legDay={legDay}
              fact={selected === "mars" && probe.stop === "mars" ? (view.fact?.fact ?? null) : null}
              vote={
                voteStops.includes(selected)
                  ? {
                      index: voteStops.indexOf(selected),
                      pct: view.voteTotal ? Math.round((probe.vote.options[voteStops.indexOf(selected)].votes / view.voteTotal) * 100) : 0,
                      mine: player.voteChoice,
                      busy: player.voting,
                    }
                  : null
              }
              onClose={close}
            />
          )}
          {techOpen && <CrewTech wide={wide} tech={tech} onClose={close} />}
        </main>
      )}
    </GameShell>
  );
}

interface ChartProps {
  wide: boolean;
  model: ReturnType<typeof mapModel>;
  selected: string | null;
  onPick: (id: string) => void;
  probeSrc: { src: string; width: number; height: number };
  probeLabel: string;
  dayChip: string;
  voteShare: (id: string) => number;
}

const WIDE_H = 600;

function Chart({ wide, model, selected, onPick, probeSrc, probeLabel, dayChip, voteShare }: ChartProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(390);
  const [thumb, setThumb] = useState({ at: 0, size: 1 });

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || wide) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [wide]);

  const g = wide ? wideGeometry(WIDE_H) : phoneGeometry(width);
  const L = layout(model, g);

  // Open centred on the probe (once per layout direction).
  const centred = useRef<string>("");
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || centred.current === String(wide)) return;
    centred.current = String(wide);
    if (wide) el.scrollLeft = L.probe.x - el.clientWidth / 2;
    else el.scrollTop = L.probe.y - el.clientHeight / 2;
  });

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const total = wide ? el.scrollWidth : el.scrollHeight;
    const seen = wide ? el.clientWidth : el.clientHeight;
    const pos = wide ? el.scrollLeft : el.scrollTop;
    setThumb({ at: total > seen ? pos / (total - seen) : 0, size: Math.min(1, seen / total) });
  };
  useEffect(onScroll, [wide, width]);

  // Desktop: drag the chart to pan (a click on a stop still works).
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!wide || e.pointerType !== "mouse" || !scroller.current) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft, moved: false };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !scroller.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4) d.moved = true;
    scroller.current.scrollLeft = d.left - dx;
  };
  const up = () => {
    setTimeout(() => (drag.current = null), 0);
  };

  const helio = L.band(rowOf("heliopause"), 70);
  const belt = L.band(rowOf("ceres"), 26);
  const kuiper = L.band(rowOf("pluto"), 26);

  return (
    <div className="map__frame">
      <div
        ref={scroller}
        className={wide ? "map__scroll map__scroll--wide" : "map__scroll"}
        onScroll={onScroll}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        tabIndex={0}
        aria-label="The star chart: scroll to see the whole route"
      >
        <div className="map__chart" style={{ width: g.w, height: g.h }}>
          <div className="map__belt" style={{ ...belt, backgroundImage: `url(${beltArt(!g.vertical)})` }} />
          <div className="map__belt" style={{ ...kuiper, backgroundImage: `url(${kuiperArt(!g.vertical)})` }} />
          <div className={g.vertical ? "map__helio" : "map__helio map__helio--wide"} style={helio} />
          <div className={g.vertical ? "map__beyond" : "map__beyond map__beyond--wide"}>
            <p className="map__beyond-title">INTERSTELLAR SPACE</p>
            <p className="map__beyond-line">Past the heliopause, only stars.</p>
          </div>
          {L.regions.map((r) => (
            <p key={r.label} className="map__region" style={{ left: r.x, top: r.y }} aria-hidden="true">
              {r.label}
            </p>
          ))}
          {L.segments.map((s, i) => (
            <span
              key={i}
              className={`map__path map__path--${s.state}${s.across ? " map__path--across" : ""}`}
              style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
            />
          ))}
          {L.nodes.map((n) => {
            const v = model.stops.get(n.id)!;
            return (
              <StopNode key={n.id} v={v} x={n.x} y={n.y} on={selected === n.id} pct={v.state === "vote" ? voteShare(n.id) : null} onPick={onPick} />
            );
          })}
          <div className="map__probe" style={{ left: L.probe.x, top: L.probe.y }} role="img" aria-label={probeLabel}>
            <img className="map__ring" src={probeRingArt()} alt="" width={72} height={72} />
            <img
              className="map__probe-art"
              src={probeSrc.src}
              alt=""
              width={probeSrc.width}
              height={probeSrc.height}
              style={{ left: -probeSrc.width / 2, top: -probeSrc.height / 2 }}
            />
            <span className="map__day num">{dayChip}</span>
          </div>
        </div>
      </div>
      <div className={wide ? "map__bar map__bar--wide" : "map__bar"} aria-hidden="true">
        <span
          className="map__thumb"
          style={
            wide
              ? { left: `${thumb.at * (1 - thumb.size) * 100}%`, width: `${thumb.size * 100}%` }
              : { top: `${thumb.at * (1 - thumb.size) * 100}%`, height: `${thumb.size * 100}%` }
          }
        />
      </div>
    </div>
  );
}

function StopNode({ v, x, y, on, pct, onPick }: { v: StopView; x: number; y: number; on: boolean; pct: number | null; onPick: (id: string) => void }) {
  const art = stopArt(v.stop.id);
  const h = art.kind === "still" ? art.still.height : art.kind === "sheet" ? art.sheet.frameHeight : art.h;
  const line =
    v.state === "next" ? "NEXT STOP" : v.state === "vote" ? `VOTE · ${pct ?? 0}%` : v.state === "skip" ? "not taken" : v.state === "teaser" ? "VOTE ON ARRIVAL" : "";
  const techOn = v.state === "visited" && v.medal;
  return (
    <button
      type="button"
      className={`map__node map__node--${v.state}${on ? " map__node--on" : ""}`}
      style={{ left: x, top: y - h / 2 - 6 }}
      onClick={() => onPick(v.stop.id)}
      aria-label={`${v.stop.name}, ${KICKER[v.state].toLowerCase()}`}
      aria-pressed={on}
    >
      <span className="map__art">
        {art.kind === "sheet" ? (
          <Sprite sprite={art.sheet} scale={1} />
        ) : art.kind === "still" ? (
          <img src={art.still.src} alt="" width={art.still.width} height={art.still.height} />
        ) : (
          <img src={art.src} alt="" width={art.w} height={art.h} />
        )}
      </span>
      <span className="map__chip">
        <span className="map__name">{v.stop.name}</span>
        {v.state === "visited" && v.leg && (
          <span className="map__date num">
            {dateOf(v.leg.arrivedAt)}
            {v.medal && <img src={medalArt(v.medal)} alt={`${MEDAL_NAMES[v.medal]} medal`} width={10} height={15} />}
          </span>
        )}
        {line && <span className="map__line">{line}</span>}
        {v.stop.tech && v.state !== "skip" && (
          <span className={techOn ? "map__tech map__tech--on" : "map__tech"}>
            <PixelIcon name="bolt" size={9} tone={techOn ? "blue" : "muted"} />
            {v.stop.tech.short}
          </span>
        )}
      </span>
    </button>
  );
}

interface CardProps {
  wide: boolean;
  v: StopView;
  legDay: number;
  /** Today's Destination file fact, when this is the leg's destination. */
  fact: string | null;
  vote: { index: number; pct: number; mine: number | null; busy: boolean } | null;
  onClose: () => void;
}

function StopCard({ wide, v, legDay, fact, vote, onClose }: CardProps) {
  const s = v.stop;
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus(), [s.id]);
  const flownFrom = v.leg?.fromStop ?? null;
  const probe = s.kind === "start" ? null : s.probe ? probeFor(s.id, "") : flownFrom ? probeFor(s.id, flownFrom) : null;
  const probeLine = s.kind === "start" ? "Where every tap starts" : (probe?.name ?? "Chosen by the crew vote before this stop");
  const kicker =
    v.state === "visited" && v.leg ? `VISITED · ${dateOf(v.leg.arrivedAt)}` : v.state === "next" ? `NEXT STOP · DAY ${legDay} OF ~${SILVER_DAYS}` : KICKER[v.state];
  const medal: Medal | null = v.state === "visited" ? v.medal : null;
  const techLabel = v.state === "visited" ? "PLANET TECH UNLOCKED" : v.state === "skip" ? "PLANET TECH · MISSED" : "PLANET TECH · TEASER";
  const techFx = s.tech ? (medal ? `${s.tech[medal]} (${MEDAL_NAMES[medal]})` : `${s.tech.gold} with Gold`) : "";
  // A stop with its Destination file (E3: Mars, Ceres, Vesta) shows its first fact and links all of them.
  const facts = factCount(s.id);
  const text = fact ?? (facts > 0 ? firstFact(s.id) : (s.fact?.text ?? null));
  const hasPage = facts > 0;
  const voteName = vote && vote.mine !== null && vote.mine !== vote.index ? "You voted for the other branch" : null;

  return (
    <section ref={ref} tabIndex={-1} className={wide ? "map__card map__card--wide" : "map__card"} aria-labelledby="map-card-title">
      <div className="map__card-top">
        <div>
          <p className={`map__card-kicker map__card-kicker--${v.state}`}>{kicker}</p>
          <h2 id="map-card-title" className="map__card-title">
            {s.name}
          </h2>
        </div>
        <button type="button" className="map__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="map__card-probe">
        <span className="map__probe-box">
          {probe ? (
            (() => {
              const st = probeStill(probe.id);
              return <img src={st.src} alt="" width={st.width} height={st.height} />;
            })()
          ) : s.kind === "start" ? (
            <img src={probeStill("pathfinder").src} alt="" width={64} height={40} />
          ) : (
            <span className="map__probe-unknown">?</span>
          )}
        </span>
        <div>
          <p className="map__card-label">PROBE</p>
          <p className="map__card-probe-name">{probeLine}</p>
          <p className="map__card-dist num">{distanceLine(s, flownFrom)}</p>
        </div>
      </div>
      {medal && v.day !== null && (
        <p className={`map__card-medal map__card-medal--${medal} num`}>
          <img src={medalArt(medal)} alt="" width={10} height={15} />
          {MEDAL_NAMES[medal].toUpperCase()} · arrived on day {v.day} of {SILVER_DAYS}
        </p>
      )}
      {v.leg?.helped && <p className="map__card-stamp">YOUR STAMP · you pushed on this leg</p>}
      {s.tech && (
        <div className={v.state === "visited" ? "map__card-tech map__card-tech--on" : "map__card-tech"}>
          <PixelIcon name="bolt" size={18} tone={v.state === "visited" ? "blue" : "muted"} />
          <div>
            <p className="map__card-label">{techLabel}</p>
            <p className="map__card-tech-name">
              {s.tech.name} · <span>{techFx}</span>
            </p>
          </div>
        </div>
      )}
      {text && (
        <div className="map__card-fact">
          <p className="map__card-label">{fact ? "TODAY'S FACT" : v.state === "visited" || v.state === "next" ? "FACT" : "FACT · TEASER"}</p>
          <p className="map__card-fact-text">
            <PixelIcon name="star" size={9} tone="orange" />
            {text}
          </p>
          {hasPage && (
            <Link href={`/destinations/${s.id}`} className="map__card-more">
              All {facts} {s.name} facts, with sources
            </Link>
          )}
        </div>
      )}
      {vote && (
        <div className="map__card-vote">
          <PixelButton
            variant="outline"
            block
            className="map__vote"
            disabled={vote.busy || (vote.mine !== null && vote.mine !== vote.index)}
            onClick={() => void castVote(vote.index)}
          >
            {vote.mine === vote.index ? "Your vote ✓" : (voteName ?? `Vote ${s.name}`)}
          </PixelButton>
          <span className="map__card-pct num">{vote.pct}%</span>
        </div>
      )}
    </section>
  );
}

function CrewTech({ wide, tech, onClose }: { wide: boolean; tech: StopView[]; onClose: () => void }) {
  return (
    <section className={wide ? "map__card map__card--wide" : "map__card"} aria-labelledby="map-tech-title">
      <div className="map__card-top">
        <div>
          <p className="map__card-kicker map__card-kicker--visited">CREW TECH · FOR EVERYONE</p>
          <h2 id="map-tech-title" className="map__card-title">
            Unlocked so far
          </h2>
        </div>
        <button type="button" className="map__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {tech.length === 0 && <p className="map__card-note">Nothing yet. The first arrives with the crew at Mars.</p>}
      {tech.map((t) => (
        <div key={t.stop.id} className="map__tech-row">
          <img src={medalArt(t.medal!)} alt={`${MEDAL_NAMES[t.medal!]} medal`} width={20} height={30} />
          <div>
            <p className="map__tech-row-name">{t.stop.tech!.name}</p>
            <p className="map__card-note">
              {t.stop.name} · {MEDAL_NAMES[t.medal!]}
            </p>
          </div>
          <span className="map__tech-row-fx num">{t.stop.tech![t.medal!]}</span>
        </div>
      ))}
      <p className="map__card-note">Every stop adds one. Arrive faster for a stronger version.</p>
    </section>
  );
}

