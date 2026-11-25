// Phase S1 (prompt 62): sharing. Both the app and the Worker use this file.
// Every share carries the sharer's crew link, /c/<code>, plus what was shared (m), a detail (d, e.g. the
// milestone's number) and the channel (v), so the counts in /admin show what works. The texts are in
// content/share.json. Plain links only: no share SDKs, no third-party scripts (decision 28).

import content from "../content/share.json";

export const MOMENTS = [
  "invite",
  "result",
  "milestone",
  "arrival",
  "branch",
  "signal",
  "safe",
  "badge",
  "rank",
  "country",
  "fact",
  "page",
  "map",
  "burn",
] as const;
export type Moment = (typeof MOMENTS)[number];

/** sheet = the phone's own share sheet (we can't tell which app it went to). */
export const CHANNELS = ["sheet", "wa", "x", "fb", "rd", "tg", "copy"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_NAMES: Record<Channel, string> = {
  sheet: "Share sheet",
  wa: "WhatsApp",
  x: "X",
  fb: "Facebook",
  rd: "Reddit",
  tg: "Telegram",
  copy: "Copy link",
};

export function isMoment(x: unknown): x is Moment {
  return typeof x === "string" && (MOMENTS as readonly string[]).includes(x);
}

export function isChannel(x: unknown): x is Channel {
  return typeof x === "string" && (CHANNELS as readonly string[]).includes(x);
}

/** Crew codes: 6 characters with no look-alikes (no 0/o, 1/l/i), about 2^30 of them. */
export const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;

/** A detail is short and plain: a number, a stop id, a badge id, or stop-number for a fact ("mars-12"). */
export const DETAIL_PATTERN = /^[a-z0-9-]{1,24}$/;

/** The crew link for one share: https://<site>/c/<code>?m=<moment>&d=<detail>&v=<channel>. The site's own address,
 * so links switch to onesmallclick.io by themselves when the domain is connected (decided in prompt 62). */
export function crewUrl(origin: string, code: string, moment: Moment, channel: Channel, detail?: string): string {
  const q = new URLSearchParams({ m: moment });
  if (detail && DETAIL_PATTERN.test(detail)) q.set("d", detail);
  q.set("v", channel);
  return `${origin}/c/${code}?${q}`;
}

/** The link that opens each app's own share screen, with the text and link filled in. */
export function channelHref(channel: Exclude<Channel, "sheet" | "copy">, url: string, text: string): string {
  const e = encodeURIComponent;
  switch (channel) {
    case "wa":
      return `https://wa.me/?text=${e(`${text} ${url}`)}`;
    case "x":
      return `https://x.com/intent/post?text=${e(text)}&url=${e(url)}`;
    case "fb":
      // Facebook takes only the link; the preview carries the words.
      return `https://www.facebook.com/sharer/sharer.php?u=${e(url)}`;
    case "rd":
      return `https://www.reddit.com/submit?url=${e(url)}&title=${e(text.slice(0, 280))}`;
    case "tg":
      return `https://t.me/share/url?url=${e(url)}&text=${e(text)}`;
  }
}

/** A country's flag as an emoji (two regional-indicator letters), for share text. "" if it isn't a code. */
export function flagEmoji(cc: string | null | undefined): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** A title as a sentence, for text that carries on after it: "Waving at Webb" → "Waving at Webb.", "Past the Moon!" stays. */
export function sentence(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

type Fill = Record<string, string | number | null | undefined>;

/** Puts the fill-ins into a template from content/share.json; a missing one becomes "". */
export function fillIn(template: string, fill: Fill): string {
  return template
    .replace(/\{(\w+)\}/g, (_, k: string) => {
      const v = fill[k];
      return v === null || v === undefined ? "" : typeof v === "number" ? v.toLocaleString("en-GB") : v;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

interface MomentText {
  message: string;
  messageAlt?: string;
  preview: string;
  image: string;
}

const MOMENT_TEXT = content.moments as Record<Exclude<Moment, "page">, MomentText>;

/** What the sharer sends for a moment (before the link). `alt` picks the second wording where there is one. */
export function shareMessage(moment: Exclude<Moment, "page">, fill: Fill, alt = false): string {
  const t = MOMENT_TEXT[moment];
  return fillIn(alt && t.messageAlt ? t.messageAlt : t.message, fill);
}

/** The link preview's title and description for a crew link (the Worker writes these into the page).
 * A sharer who hasn't pushed yet gets "previewNew" instead of a line about their km. */
export function previewText(moment: Moment, fill: Fill, pushedKm: number): { title: string; description: string } {
  const t = MOMENT_TEXT[moment === "page" ? "invite" : moment] ?? MOMENT_TEXT.invite;
  const template = pushedKm < 1 && t.preview.includes("{km}") ? content.previewNew : t.preview;
  return { title: fillIn(content.previewTitle, fill), description: fillIn(template, fill) };
}

/** The preview image's name in public/share/ (without .png), from the moment's template; the Worker checks it exists. */
export function previewImage(moment: Moment, fill: Fill): string {
  const t = MOMENT_TEXT[moment === "page" ? "invite" : moment] ?? MOMENT_TEXT.invite;
  return fillIn(t.image, fill);
}

/** Every preview image scripts/make-previews.mjs makes (public/share/<name>.png). The Worker falls back to "default". */
export const PREVIEW_IMAGES = [
  "default",
  "milestone-past-the-moon",
  "milestone-webb-neighbourhood",
  "milestone-mid-course-burn",
  "milestone-halfway",
  "milestone-a-day-on-mars",
  "milestone-phobos-in-view",
  "arrival-mars",
  "branch-mars",
  "signal",
  "safe",
  "badge",
  "countries",
  "destination-mars",
  "burn",
] as const;

/** The Wordle-style result line (the design's 1e share card, one line per row), easy to paste anywhere. */
export function resultLine(t: {
  missionDay: number;
  destName: string;
  progress: number;
  kmToday: number;
  cc?: string | null;
  arrival: string;
}): string {
  const pct = Math.min(100, Math.max(0, Math.floor(t.progress * 100)));
  const cells = Math.round(pct / 10);
  const flag = flagEmoji(t.cc);
  return [
    `OneSmallClick · Day ${t.missionDay} 🚀`,
    `${"▰".repeat(cells)}${"▱".repeat(10 - cells)} ${pct}% to ${t.destName}`,
    `I pushed ${Math.round(t.kmToday).toLocaleString("en-GB")} km today${flag ? ` ${flag}` : ""}`,
    `Arrival: ${t.arrival}`,
  ].join("\n");
}

// ---------- Recruits (phase S2, decisions 26–27, prompts 64–65) ----------

/** A device becomes a recruit at this many credited taps (or a Ping). */
export const RECRUIT_TAPS = 50;
/** "New": the device first opened the game at most this long before it opened the crew link. */
export const RECRUIT_NEW_MS = 30 * 60_000;
/** At most this many recruits a day count for one recruiter (badges and the profile). */
export const RECRUITS_PER_DAY = 10;
/** Crew Recruiter I / II / III. */
export const RECRUITER_LEVELS = [1, 5, 25] as const;
