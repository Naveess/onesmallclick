import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { usePrefersReducedMotion } from "../theme";
import { PixelIcon } from "./PixelIcon";
import "./ThrustButton.css";

interface ThrustButtonProps {
  /** Called on every tap; returns the km it added, for the "+km" popup. */
  onThrust: () => number;
  /** md: 184px button (phone) · lg: 240px (wide layout). */
  size?: "md" | "lg";
  /** Small line under THRUST. */
  hint?: string;
  /** Let the Space bar press THRUST from anywhere on the page (the wide layout). */
  spaceKey?: boolean;
}

// Fast tapping could make hundreds of particles; cap what's on screen at once.
const MAX_PARTICLES = 60;
// At most this many "+km" popups at once; a new one replaces the oldest, so every tap shows its number.
const MAX_POPUPS = 6;
const PARTICLE_COLOURS = ["var(--text-blue)", "var(--text)", "var(--text-blue-bright)", "var(--text-orange)"];

/** The big THRUST button, with the design's particles and "+km" popup (both off with reduced motion). */
export function ThrustButton({ onThrust, size = "md", hint = "tap to push", spaceKey = false }: ThrustButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const live = useRef({ particles: 0 });
  const popups = useRef<{ el: HTMLElement; anim: Animation }[]>([]);
  // True when a mouse press already fired THRUST, so the click that follows doesn't count twice.
  const mousePressed = useRef(false);
  const reduceMotion = usePrefersReducedMotion();

  const burst = (km: number) => {
    const host = hostRef.current;
    if (!host || reduceMotion) return;
    const w = host.offsetWidth;
    const h = host.offsetHeight;

    // Ten pixel sparks fly up from the top of the button (design: 650–1000 ms, steps(9)).
    for (let i = 0; i < 10 && live.current.particles < MAX_PARTICLES; i++) {
      const p = document.createElement("span");
      const z = i % 3 ? 4 : 6;
      p.className = "thrust__particle";
      p.style.cssText = `left:${Math.round(w / 2 - z / 2 + (Math.random() - 0.5) * 40)}px;top:${Math.round(h * 0.25)}px;width:${z}px;height:${z}px;background:${PARTICLE_COLOURS[i % 4]}`;
      host.appendChild(p);
      live.current.particles++;
      const dx = Math.round((Math.random() - 0.5) * 120);
      const dy = -Math.round(110 + Math.random() * 120);
      p.animate(
        [
          { transform: "translate(0,0)", opacity: 1 },
          { transform: `translate(${dx}px,${dy}px)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 350, easing: "steps(9)" },
      ).onfinish = () => {
        p.remove();
        live.current.particles--;
      };
    }

    // "+12 km" rises and fades (design: 800 ms, steps(8)).
    if (popups.current.length >= MAX_POPUPS) {
      const oldest = popups.current.shift();
      oldest?.anim.cancel();
      oldest?.el.remove();
    }
    const t = document.createElement("span");
    t.className = "thrust__popup";
    t.textContent = `+${km} km`;
    host.appendChild(t);
    const anim = t.animate(
      [
        { transform: "translate(-50%,0)", opacity: 1 },
        { transform: "translate(-50%,-40px)", opacity: 0 },
      ],
      { duration: 800, easing: "steps(8)" },
    );
    const entry = { el: t, anim };
    popups.current.push(entry);
    anim.onfinish = () => {
      t.remove();
      popups.current = popups.current.filter((x) => x !== entry);
    };
  };

  const press = () => burst(onThrust());

  // A mouse fires THRUST the moment it goes down, not on release, so the "+km" appears straight away.
  // Touch still fires on the click (on release), so a scroll that starts on THRUST doesn't count.
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    mousePressed.current = e.pointerType === "mouse" && e.button === 0;
    if (mousePressed.current) press();
  };
  // Keyboard clicks (Space/Enter on the focused button) have detail 0 and always count.
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail !== 0 && mousePressed.current) {
      mousePressed.current = false;
      return;
    }
    press();
  };

  // Space presses THRUST anywhere on the page, unless you're typing or on another control.
  // (On the THRUST button itself, the browser's own Space handling clicks it.)
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    if (!spaceKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, button, a, [contenteditable], dialog")) return;
      e.preventDefault(); // don't scroll the page
      pressRef.current();
      const b = buttonRef.current;
      if (b) {
        b.classList.add("is-pressed");
        window.setTimeout(() => b.classList.remove("is-pressed"), 90);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spaceKey]);

  const lg = size === "lg";
  return (
    <div ref={hostRef} className={lg ? "thrust thrust--lg" : "thrust"}>
      <div className="thrust__ring" aria-hidden="true" />
      <div className="thrust__focus" aria-hidden="true" />
      <button ref={buttonRef} type="button" className="thrust__button" aria-label="Thrust"
        onPointerDown={onPointerDown}
        onClick={onClick}
      >
        <span className="thrust__gap" />
        <span className="thrust__face" />
        <span className="thrust__label">
          {/* Always the dark theme's white, like the rest of THRUST */}
          <span style={{ color: "var(--thrust-label)" }}>
            <PixelIcon name="up" size={lg ? 36 : 27} />
          </span>
          <span className="thrust__word">THRUST</span>
          <span className="thrust__hint">{hint}</span>
        </span>
      </button>
    </div>
  );
}
