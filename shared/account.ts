// Accounts and sign-in (phase 8a), shared by the browser and the Worker.

/** Your account, as /api/session describes it (null for guests). */
export interface AccountInfo {
  name: string;
  /** False until you've picked a name from the offers (straight after your first sign-in). */
  nameChosen: boolean;
  email: string | null;
  google: boolean;
  /** Two-letter country code, or null if Cloudflare couldn't tell. */
  country: string | null;
  /** The country can be changed once (decision 16). */
  countryChangeable: boolean;
}

/** GET /api/session. */
export interface SessionInfo {
  /** Your account's name when signed in, else this device's generated name. */
  name: string;
  /** This device's crew number ("Keep playing as guest · Crew #48,213"). */
  crew: number;
  account: AccountInfo | null;
  /** Email sign-in works here (phase G1: the nudges say "Sign in with Google" while it doesn't). */
  emailSignIn?: boolean;
}

/** POST /api/auth/email. In local development the link comes back in `devLink` instead of an email. */
export type EmailLinkResult =
  | { ok: true; devLink?: string }
  | { ok: false; reason: "invalid-email" | "bot-check" | "too-many" | "unavailable" | "no-device" | "maintenance" };

/** POST /api/auth/confirm. */
export type ConfirmResult = { ok: true } | { ok: false; reason: "invalid" | "expired" | "used" | "no-device" | "maintenance" };

/** GET /api/auth/names: three names to pick from (the first is the device's own when it's free). */
export interface NameOffers {
  offers: string[];
}

/** A sign-in link lasts this long. */
export const LINK_TTL_MS = 15 * 60_000;
/** A session lasts this long, renewed as you play. */
export const SESSION_TTL_MS = 90 * 86_400_000;

/** Two-letter region codes that aren't countries (for the country picker). */
export const NOT_COUNTRIES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ", "AA", "QM", "QN", "QZ", "XX"]);

/** A plausible country code: two capital letters that aren't one of the non-countries. */
export function isCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && !NOT_COUNTRIES.has(code);
}
