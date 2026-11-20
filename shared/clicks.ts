// The click badges (decided 2026-11-19, docs/plan.md "Flight view"). They count a player's all-time
// credited clicks (Nav, prompt 33, "for now"). "You've clicked" under THRUST shows the bar to the next
// one; phase 8b awards them.

export interface ClickBadge {
  name: string;
  clicks: number;
}

export const CLICK_BADGES: readonly ClickBadge[] = [
  { name: "Steady Finger", clicks: 1_500 },
  { name: "Iron Thumb", clicks: 5_000 },
  { name: "Ten Thousand Club", clicks: 10_000 },
];

/** The next click badge above `clicks`, or null once past the last one. */
export function nextClickBadge(clicks: number): ClickBadge | null {
  return CLICK_BADGES.find((b) => clicks < b.clicks) ?? null;
}
