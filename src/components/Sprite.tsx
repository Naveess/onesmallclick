import type { CSSProperties } from "react";
import type { SpriteSheet, Still } from "../sprites";
import { usePrefersReducedMotion } from "../theme";
import "./Sprite.css";

/**
 * Whole-number scales, so every art pixel stays a square of screen pixels.
 * 0.5 is the one exception: exact halving of 128px art to 64px (Mars) and 32px to 16px (the Moon),
 * which the design does on the game home track. Use it only there.
 */
export type PixelScale = 0.5 | 1 | 2 | 3 | 4;

interface SpriteProps {
  sprite: SpriteSheet;
  scale?: PixelScale;
  /** Describes the sprite for screen readers. Leave out for decoration. */
  label?: string;
  /** Pause on the current frame. */
  playing?: boolean;
  /** Add the design's gentle bob (the probe in flight). */
  bob?: boolean;
  /** For one-shot sprites: shown instead when the player prefers reduced motion. */
  still?: Still;
  /** Called when a one-shot sprite finishes. */
  onEnd?: () => void;
  className?: string;
}

/** Plays a horizontal sprite sheet with CSS steps(). Stops on frame 1 with reduced motion. */
export function Sprite({ sprite, scale = 2, label, playing = true, bob = false, still, onEnd, className }: SpriteProps) {
  const reduceMotion = usePrefersReducedMotion();
  if (import.meta.env.DEV && !Number.isInteger(scale) && scale !== 0.5) {
    console.warn(`Sprite "${sprite.name}": scale ${scale} is not a whole number`);
  }

  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  const classes = ["sprite", bob && "sprite--bob", className].filter(Boolean).join(" ");

  if (reduceMotion && still) {
    return (
      <span className={classes} style={{ width: still.width * scale, height: still.height * scale }} {...a11y}>
        <img className="sprite__still" src={still.src} alt="" width={still.width * scale} height={still.height * scale} />
      </span>
    );
  }

  const sheetStyle: CSSProperties = {
    animationDuration: `${sprite.durationMs}ms`,
    animationTimingFunction: `steps(${sprite.frames})`,
    animationIterationCount: sprite.loop ? "infinite" : 1,
    animationPlayState: playing ? "running" : "paused",
  };

  return (
    <span className={classes} style={{ width, height }} {...a11y}>
      <img
        className="sprite__sheet"
        src={sprite.src}
        alt=""
        width={width * sprite.frames}
        height={height}
        draggable={false}
        style={sheetStyle}
        onAnimationEnd={onEnd}
      />
    </span>
  );
}
