import { useRef, useState, type ReactNode } from "react";
import { ICON_NAMES, type IconName } from "../components/iconPaths";
import { PixelButton } from "../components/PixelButton";
import { PixelIcon, type IconTone } from "../components/PixelIcon";
import { Sky } from "../components/Sky";
import { Sprite, type PixelScale } from "../components/Sprite";
import { ThemeToggle } from "../components/ThemeToggle";
import { AdSlot, HereNow } from "../components/GameCards";
import { ClickCounter } from "../components/ClickCounter";
import { FlightView, type FlightHandle } from "../components/FlightView";
import { ThrustButton } from "../components/ThrustButton";
import { Window } from "../components/Window";
import { MILESTONES, ROUTE_KM } from "../game/rules";
import { SPRITES, STILLS, type SpriteSheet, type Still } from "../sprites";
import { useTheme, type Theme } from "../theme";
import { useDocumentTitle, useNoIndex } from "./useDocumentTitle";
import "./KitPage.css";

/** /kit: every piece of the pixel kit, in both themes side by side. Not linked from the site. */
export function KitPage() {
  useDocumentTitle("Pixel kit · OneSmallClick");
  useNoIndex();
  const { theme, saved, followSystem } = useTheme();

  return (
    <div className="kit">
      <header className="kit__header">
        <div className="kit__intro">
          <p className="label">OneSmallClick · phase 2</p>
          <h1 className="kit__title">Pixel kit</h1>
          <p className="kit__lede">
            Every piece the screens are built from, shown in both themes. Compare it with the Art kit screen in{" "}
            <code>design/OneSmallClick.dc.html</code>.
          </p>
        </div>
        <div className="kit__controls">
          <ThemeToggle />
          {saved && (
            <PixelButton variant="outline" onClick={followSystem}>
              Follow system
            </PixelButton>
          )}
          <p className="kit__status" aria-live="polite">
            Page theme: {theme}, {saved ? "saved in this browser" : "following your system"}.
          </p>
          <a href="/">Back to the home page</a>
        </div>
      </header>

      <div className="kit__sheets">
        <KitSheet theme="dark" title="Dark · the night sky" />
        <KitSheet theme="light" title="Light · daylight mission control" />
      </div>
    </div>
  );
}

function KitSheet({ theme, title }: { theme: Theme; title: string }) {
  const id = `kit-${theme}`;
  return (
    <section className="kit-sheet" data-theme={theme} aria-labelledby={id}>
      <Sky />
      <div className="kit-sheet__body">
        <h2 id={id} className="kit-sheet__title">
          {title}
        </h2>
        <ArtKit />
        <GamePiecesSection />
        <WindowsSection />
        <ButtonsSection />
        <SpritesSection />
        <StillsSection />
        <IconsSection />
        <TypeSection />
        <PaletteSection />
      </div>
    </section>
  );
}

/* The design's "Art kit & notes" card, rebuilt from the kit with the shipped sprites. */
const ART_KIT_ICONS: [IconName, IconTone][] = [
  ["up", "blue"],
  ["signal", "orange"],
  ["bolt", "blue"],
  ["trophy", "orange"],
  ["log", "blue"],
  ["user", "white"],
  ["star", "orange"],
  ["check", "blue"],
  ["clock", "white"],
  ["mail", "blue"],
];

function ArtKit() {
  return (
    <Window className="art-kit">
      <h3 className="label">Sprites · PixelLab 16-bit, 1× and 2× only</h3>
      <div className="art-kit__sprites">
        <Sprite sprite={SPRITES.earth} scale={2} label="Earth" />
        <StillImage still={STILLS.moon} scale={2} label="Moon" />
        <Sprite sprite={SPRITES.thruster} scale={2} bob label="Probe OSC-1" />
        <Sprite sprite={SPRITES.mars} scale={1} label="Mars" />
      </div>
      <div className="art-kit__icons">
        {ART_KIT_ICONS.map(([name, tone]) => (
          <PixelIcon key={name} name={name} tone={tone} size={27} />
        ))}
      </div>
      <div className="art-kit__swatches" aria-hidden="true">
        <span style={{ background: "var(--outline)", outline: "2px solid var(--line-dim)" }} />
        <span style={{ background: "var(--sky-1)" }} />
        <span style={{ background: "var(--window-top)" }} />
        <span style={{ background: "var(--blue)" }} />
        <span style={{ background: "var(--orange)" }} />
        <span style={{ background: "var(--white)" }} />
      </div>
      <div className="art-kit__type">
        <p className="art-kit__ui">Pixelify Sans · UI &amp; headings</p>
        <p className="art-kit__num num">VT323 · 14 MARCH 2027 · 04:12:39</p>
      </div>
      <p className="art-kit__notes">
        Painted nebula sky with two parallax star layers; Earth, Mars and the probe loop on sprite sheets,
        double-bordered windows. Light blue = action &amp; path; orange = signal, milestones, celebration.
      </p>
    </Window>
  );
}

function KitSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Window as="section" className="kit-section">
      <h3 className="label">{title}</h3>
      {children}
    </Window>
  );
}

/* Phase 3 pieces of the game home, with fixed sample numbers. */
function GamePiecesSection() {
  const [taps, setTaps] = useState(0);
  const flight = useRef<FlightHandle>(null);
  const sampleKm = 182_406_311;
  // The flight view (prompt 32) with fixed sample numbers, and its states: safe mode only shows here,
  // because in the game safe mode replaces the home with its own screen (1f).
  const flightSample = {
    progress: sampleKm / ROUTE_KM,
    distanceKm: sampleKm,
    routeKm: ROUTE_KM,
    speedKmS: 29.62,
    crewKmS: 120,
    online: 12_481,
    handful: false,
    arrivalAt: Date.UTC(2027, 1, 16),
    milestones: MILESTONES,
    nextMilestone: MILESTONES[3],
    toNextKm: MILESTONES[3].km - sampleKm,
    safe: false,
    urgent: false,
    signalLeftS: 15_152,
    paused: false,
  };
  return (
    <KitSection title="Game home pieces · phase 3">
      <div className="kit-row kit-row--center">
        <ThrustButton
          onThrust={() => {
            setTaps((t) => t + 1);
            flight.current?.boost(12);
            return 12;
          }}
        />
      </div>
      <p className="kit-note">
        <span className="kit-strong">ThrustButton.</span> The same in both themes (fixed --thrust-* colours). 184px here, 240px on
        the wide layout. Taps on this sample: <span className="num kit-blue">{taps}</span>
      </p>
      <ClickCounter today={1_284 + taps} all={48_920 + taps} />
      <p className="kit-note">
        <span className="kit-strong">FlightView.</span> Deep space in both themes (fixed --space-* colours). THRUST above boosts it.
      </p>
      <FlightView handle={flight} {...flightSample} />
      <p className="kit-note">Final 60 seconds of the signal</p>
      <FlightView {...flightSample} urgent signalLeftS={42} />
      <p className="kit-note">Idle pause (nobody tapping), and a small crew</p>
      <FlightView {...flightSample} paused crewKmS={0} online={3} arrivalAt={null} />
      <p className="kit-note">Safe mode (in the game, safe mode shows its own screen instead)</p>
      <FlightView {...flightSample} safe crewKmS={0} />
      <div className="kit-row">
        <HereNow online={12_481} idling={null} />
        <HereNow online={7} idling={48_206} />
      </div>
      <AdSlot width={320} height={50} />
    </KitSection>
  );
}

function WindowsSection() {
  return (
    <KitSection title="Window · four tones">
      <div className="kit-stack">
        <Window>
          <p className="kit-strong">Blue (standard)</p>
          <p className="kit-note">2px light border, 2px dark outline, 2px inset.</p>
        </Window>
        <Window tone="orange">
          <p className="kit-strong kit-orange">Orange (signal, milestones)</p>
          <p className="kit-note kit-warm">Signal window. No inset, as in the design.</p>
        </Window>
        <Window tone="muted">
          <p className="kit-strong">Muted (locked, quiet)</p>
          <p className="kit-note">A badge not earned yet.</p>
        </Window>
        <Window tone="active">
          <p className="kit-strong kit-blue">Active (highlighted)</p>
          <p className="kit-note">Your own row on a board.</p>
        </Window>
      </div>
    </KitSection>
  );
}

function ButtonsSection() {
  return (
    <KitSection title="PixelButton · blue, outline, orange">
      <div className="kit-row">
        <PixelButton>Blue</PixelButton>
        <PixelButton variant="outline">Outline</PixelButton>
        <PixelButton variant="orange">Orange</PixelButton>
      </div>
      <div className="kit-row">
        <PixelButton icon={<PixelIcon name="up" tone="blue" />}>With icon</PixelButton>
        <PixelButton variant="orange" icon={<PixelIcon name="signal" tone="orange" />}>
          Ping
        </PixelButton>
        <PixelButton variant="outline" icon={<PixelIcon name="mail" tone="white" />}>
          Email link
        </PixelButton>
      </div>
      <div className="kit-row">
        <PixelButton disabled>Disabled</PixelButton>
        <PixelButton variant="outline" disabled>
          Disabled
        </PixelButton>
        <PixelButton variant="orange" disabled>
          Disabled
        </PixelButton>
      </div>
      <PixelButton size="lg" block>
        Large, full width
      </PixelButton>
      <p className="kit-note">md is 46px tall, lg 52px. Blue and orange press down into their 4px shadow.</p>
    </KitSection>
  );
}

function spriteFacts(s: SpriteSheet) {
  const perFrame = Math.round(s.durationMs / s.frames);
  return `${s.frames} frames of ${s.frameWidth}×${s.frameHeight}, ${s.durationMs} ms a pass (${perFrame} ms a frame). Design: ${s.design.frames} frames in ${s.design.durationMs} ms.`;
}

function SpritesSection() {
  const [burstKey, setBurstKey] = useState(0);
  const [bursting, setBursting] = useState(false);
  const loops: { sprite: SpriteSheet; scales: PixelScale[]; bob?: boolean }[] = [
    { sprite: SPRITES.thruster, scales: [1, 2], bob: true },
    { sprite: SPRITES.earth, scales: [1, 2] },
    { sprite: SPRITES.mars, scales: [1, 2] },
    { sprite: SPRITES.marsSmall, scales: [1, 2] },
  ];

  return (
    <KitSection title="Sprite · steps(), whole-number scales">
      {loops.map(({ sprite, scales, bob }) => (
        <figure key={sprite.name} className="kit-figure">
          <div className="kit-row kit-row--end">
            {scales.map((scale) => (
              <div key={scale} className="kit-scale">
                <Sprite sprite={sprite} scale={scale} bob={bob} label={`${sprite.name} at ${scale}×`} />
                <span className="kit-caption num">{scale}×</span>
              </div>
            ))}
          </div>
          <figcaption className="kit-note">
            <span className="kit-strong">{sprite.name}.</span> {spriteFacts(sprite)}
          </figcaption>
        </figure>
      ))}

      <figure className="kit-figure">
        <div className="kit-row kit-row--end">
          <div className="kit-burst">
            {bursting && (
              <Sprite
                key={burstKey}
                sprite={SPRITES.burst}
                scale={2}
                still={STILLS.firework}
                label="Firework burst"
                onEnd={() => setBursting(false)}
              />
            )}
          </div>
          <PixelButton
            variant="orange"
            icon={<PixelIcon name="star" tone="orange" />}
            onClick={() => {
              setBurstKey((k) => k + 1);
              setBursting(true);
            }}
          >
            Play burst
          </PixelButton>
        </div>
        <figcaption className="kit-note">
          <span className="kit-strong">{SPRITES.burst.name}</span> (plays once). {spriteFacts(SPRITES.burst)} With
          reduced motion it shows the still firework instead.
        </figcaption>
      </figure>
    </KitSection>
  );
}

function StillImage({ still, scale, label }: { still: Still; scale: PixelScale; label?: string }) {
  return (
    <img
      src={still.src}
      alt={label ?? ""}
      width={still.width * scale}
      height={still.height * scale}
      className="kit-still"
    />
  );
}

function StillsSection() {
  const items: { still: Still; scale: PixelScale }[] = [
    { still: STILLS.probe, scale: 2 },
    { still: STILLS.earth, scale: 2 },
    { still: STILLS.moon, scale: 2 },
    { still: STILLS.firework, scale: 2 },
    { still: STILLS.mars, scale: 1 },
    { still: STILLS.milestoneFlag, scale: 2 },
    { still: STILLS.badgeBlue, scale: 2 },
    { still: STILLS.badgeOrange, scale: 2 },
    { still: STILLS.badgeRed, scale: 2 },
    { still: STILLS.earthSmall, scale: 1 },
    { still: STILLS.earthSmall, scale: 2 },
  ];
  return (
    <KitSection title="Stills">
      <div className="kit-grid">
        {items.map(({ still, scale }) => (
          <figure key={`${still.src}-${scale}`} className="kit-tile">
            <StillImage still={still} scale={scale} />
            <figcaption className="kit-caption">
              {still.name} <span className="num">{scale}×</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </KitSection>
  );
}

const TONES: IconTone[] = ["blue", "orange", "white", "muted"];

function IconsSection() {
  return (
    <KitSection title="PixelIcon · 9×9, four tones">
      <table className="kit-icons">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Icon</span>
            </th>
            {TONES.map((tone) => (
              <th key={tone} scope="col" className="kit-caption">
                {tone}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ICON_NAMES.map((name) => (
            <tr key={name}>
              <th scope="row" className="kit-caption">
                {name}
              </th>
              {TONES.map((tone) => (
                <td key={tone}>
                  <PixelIcon name={name} tone={tone} size={27} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="kit-row kit-row--end">
        {([9, 18, 27, 36] as const).map((size) => (
          <div key={size} className="kit-scale">
            <PixelIcon name="signal" tone="orange" size={size} />
            <span className="kit-caption num">{size}px</span>
          </div>
        ))}
      </div>
    </KitSection>
  );
}

function TypeSection() {
  return (
    <KitSection title="Fonts · self-hosted">
      <div className="kit-type">
        {[400, 500, 600, 700].map((weight) => (
          <p key={weight} style={{ fontWeight: weight, fontSize: 20 }}>
            Pixelify Sans {weight} · Push the probe
          </p>
        ))}
        <p className="num kit-type__num" style={{ fontSize: 20 }}>
          VT323 20 · 238,411,906 km
        </p>
        <p className="num kit-type__num" style={{ fontSize: 30 }}>
          VT323 30 · 14 MARCH 2027
        </p>
        <p className="num kit-type__num kit-type__big" style={{ fontSize: 44 }}>
          23:59:07
        </p>
      </div>
    </KitSection>
  );
}

/* Every colour in theme.css, by name. Keep in step with src/styles/theme.css. */
const PALETTE: [string, string[]][] = [
  ["Page and lines", ["page", "outline", "line-dim", "line", "line-blue", "dash", "dash-solid"]],
  ["Sky", ["sky-1", "sky-2", "sky-3", "sky-4", "sky-5", "sky-6"]],
  ["Sky, safe mode", ["sky-safe-1", "sky-safe-2", "sky-safe-3", "sky-safe-4", "sky-safe-5", "sky-safe-6"]],
  ["Sky, milestone", ["sky-milestone-1", "sky-milestone-2", "sky-milestone-3", "sky-milestone-4", "sky-milestone-5"]],
  ["Sky, arrival", ["sky-arrival-1", "sky-arrival-2", "sky-arrival-3", "sky-arrival-4"]],
  [
    "Windows and surfaces",
    [
      "window-top",
      "window-bottom",
      "window-border",
      "window-inset",
      "window-active-top",
      "window-active-bottom",
      "window-orange-top",
      "window-orange-bottom",
      "window-muted-top",
      "window-muted-bottom",
      "window-muted-border",
      "sheet-mid",
      "tabbar",
      "field",
      "well",
      "postcard-sky",
      "row-me",
      "white",
    ],
  ],
  ["Light blue", ["blue", "blue-deep", "blue-hover", "blue-shadow", "blue-text-shadow", "vote-bar"]],
  [
    "Light orange",
    [
      "orange",
      "orange-deep",
      "orange-well",
      "orange-hover",
      "orange-shadow",
      "orange-text-shadow",
      "orange-inset",
      "orange-track",
      "vote-bar-picked",
      "badge-well",
      "badge-border",
      "stamp",
    ],
  ],
  ["Paper", ["paper", "paper-edge"]],
  [
    "Text",
    [
      "text",
      "text-soft",
      "text-muted",
      "text-faint",
      "text-dim",
      "text-blue",
      "text-blue-bright",
      "text-orange",
      "text-orange-soft",
      "text-orange-bright",
      "text-warm",
      "text-warm-soft",
      "text-warm-muted",
      "text-on-blue",
      "text-ink",
      "text-stamp",
    ],
  ],
];

function PaletteSection() {
  return (
    <KitSection title="Palette · docs/tokens.css by name">
      {PALETTE.map(([group, names]) => (
        <div key={group} className="kit-palette">
          <p className="kit-strong">{group}</p>
          <ul className="kit-palette__list">
            {names.map((name) => (
              <li key={name}>
                <span className="kit-palette__chip" style={{ background: `var(--${name})` }} aria-hidden="true" />
                <code>--{name}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </KitSection>
  );
}
