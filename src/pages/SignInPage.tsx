import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { isCountryCode, type ConfirmResult, type EmailLinkResult, type NameOffers } from "../../shared/account";
import { PixelButton } from "../components/PixelButton";
import { PixelIcon } from "../components/PixelIcon";
import { Sky } from "../components/Sky";
import { ProbeArt } from "../components/ProbeArt";
import { Window } from "../components/Window";
import { int } from "../game/format";
import { useGame } from "../game/store";
import { turnstileToken } from "../game/turnstile";
import { Link } from "../router";
import { useDocumentTitle } from "./useDocumentTitle";
import "./SignInPage.css";

// /sign-in (phase 8a). Guests get the design's 1i: email link or Google. The other states aren't in
// the design and are built from the kit in 1i's style: "check your email", the name picker (straight
// after the first sign-in), and your account (name, country, sign out, delete).
// /sign-in/confirm is the email link's page: one button, so a mail scanner opening the link signs nobody in.

const GOOGLE_ERRORS: Record<string, string> = {
  "google-off": "Google sign-in isn't switched on here yet. Use the email link instead.",
  "google-cancelled": "Google sign-in was cancelled.",
  "google-failed": "Google sign-in didn't work. Please try again.",
  "no-device": "Open the game first, then sign in.",
};

const EMAIL_ERRORS: Record<Extract<EmailLinkResult, { ok: false }>["reason"], string> = {
  "invalid-email": "That doesn't look like an email address.",
  "bot-check": "The bot check failed. Please try again.",
  "too-many": "That's a lot of links. Please wait a few minutes and try again.",
  unavailable: "Email sign-in opens soon. Use Google for now.",
  "no-device": "Open the game first, then sign in.",
};

async function post<T>(path: string, body: object = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

/** The sky and a single column, like the design's 1i. */
function Frame({ children, label }: { children: ReactNode; label: string }) {
  const { view } = useGame();
  return (
    <>
      <Sky fixed />
      <main className="signin" aria-label={label}>
        <div className="signin__probe">
          <ProbeArt id={view.probeId} scale={2} label={`Probe ${view.probeName}`} />
        </div>
        {children}
      </main>
    </>
  );
}

export function SignInPage() {
  useDocumentTitle("Sign in · OneSmallClick");
  const { player } = useGame();
  if (!player.known) return <Frame label="Sign in">{null}</Frame>;
  if (!player.account) return <GuestForm crew={player.crew} />;
  if (!player.account.nameChosen) return <NamePicker current={player.account.name} />;
  return <AccountView />;
}

// ---------- 1i: join the crew ----------

function GuestForm({ crew }: { crew: number }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ to: string; devLink?: string } | null>(null);
  const [error, setError] = useState(() => GOOGLE_ERRORS[new URLSearchParams(window.location.search).get("error") ?? ""] ?? "");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const token = await turnstileToken("signin");
      const { data } = await post<EmailLinkResult>("/api/auth/email", { email, token });
      if (data.ok) setSent({ to: email.trim(), devLink: data.devLink });
      else setError(EMAIL_ERRORS[data.reason] ?? EMAIL_ERRORS.unavailable);
    } catch {
      setError("We couldn't reach the probe. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Frame label="Check your email">
        <div>
          <h1 className="signin__title">Check your email</h1>
          <p className="signin__lede">
            We sent a sign-in link to <strong className="signin__email">{sent.to}</strong>. It works once, for 15 minutes.
            Open it on this device to sign in here.
          </p>
        </div>
        {sent.devLink && (
          <Window className="signin__dev">
            <p className="signin__small">Local development: no email is sent. This is the link it would contain.</p>
            <a className="pbtn pbtn--blue pbtn--block" href={sent.devLink}>
              Open the sign-in link
            </a>
          </Window>
        )}
        <PixelButton variant="outline" block onClick={() => setSent(null)}>
          Use a different address
        </PixelButton>
        <Link href="/" className="signin__guest">
          Back to the mission
        </Link>
      </Frame>
    );
  }

  return (
    <Frame label="Sign in">
      <div>
        <h1 className="signin__title">Join the crew</h1>
        <p className="signin__lede">
          Your taps count either way. Sign in to keep your badges, your ping streak and your name in the credits.
        </p>
      </div>
      <form className="signin__form" onSubmit={submit}>
        <label className="signin__field">
          <span className="signin__label">EMAIL</span>
          <input
            className="signin__input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <PixelButton type="submit" block disabled={busy} icon={<PixelIcon name="mail" size={18} tone="blue" />}>
          {busy ? "Sending…" : "Email me a sign-in link"}
        </PixelButton>
      </form>
      <div className="signin__or" aria-hidden="true">
        <span />
        or
        <span />
      </div>
      {/* A full page load: Google's page, then back to /api/auth/google/callback. */}
      <a className="pbtn pbtn--outline pbtn--block signin__google" href="/api/auth/google">
        <span className="signin__g" aria-hidden="true">
          G
        </span>
        Continue with Google
      </a>
      {error && (
        <p className="signin__error" role="alert">
          {error}
        </p>
      )}
      <p className="signin__small">
        No password. We never post anything for you.
        <span className="signin__legal">
          <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/contact">Contact</a>
        </span>
      </p>
      <Link href="/" className="signin__guest">
        Keep playing as guest{crew > 0 && ` · Crew #${int(crew)}`}
      </Link>
    </Frame>
  );
}

// ---------- After the first sign-in: pick a name ----------

function NamePicker({ current }: { current: string }) {
  const [offers, setOffers] = useState<string[]>([current]);
  const [pick, setPick] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/names", { credentials: "same-origin", cache: "no-store" })
      .then((r) => r.json() as Promise<NameOffers>)
      .then((d) => d.offers?.length && setOffers(d.offers))
      .catch(() => {});
  }, []);

  const choose = async () => {
    setBusy(true);
    setError("");
    const { data } = await post<{ ok: boolean; reason?: string }>("/api/auth/name", { name: pick });
    if (data.ok || data.reason === "already-chosen") window.location.replace("/sign-in");
    else {
      setError(data.reason === "taken" ? "Someone just took that one. Pick another." : "That didn't work. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Frame label="Pick your crew name">
      <div>
        <h1 className="signin__title">You're on the crew</h1>
        <p className="signin__lede">Pick your crew name. It goes on the leaderboards and in the mission credits.</p>
      </div>
      <div className="signin__names" role="radiogroup" aria-label="Crew names">
        {offers.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={pick === n}
            className={pick === n ? "signin__name signin__name--on" : "signin__name"}
            onClick={() => setPick(n)}
          >
            {pick === n && <PixelIcon name="check" size={18} tone="blue" />}
            {n}
          </button>
        ))}
      </div>
      <PixelButton block size="lg" disabled={busy} onClick={() => void choose()}>
        Use {pick}
      </PixelButton>
      {error && (
        <p className="signin__error" role="alert">
          {error}
        </p>
      )}
      <p className="signin__small">Names are made up for you, so nobody can pick a rude one. You choose once.</p>
    </Frame>
  );
}

// ---------- Your account ----------

/** Every two-letter region the browser can name, without the non-countries, by name. */
function useCountries(): { code: string; name: string }[] {
  return useMemo(() => {
    const names = new Intl.DisplayNames(["en-GB"], { type: "region" });
    const out: { code: string; name: string }[] = [];
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = isCountryCode(code) ? names.of(code) : undefined;
        if (name && name !== code) out.push({ code, name });
      }
    }
    return out.sort((x, y) => x.name.localeCompare(y.name, "en-GB"));
  }, []);
}

function AccountView() {
  const { player } = useGame();
  const account = player.account!;
  const countries = useCountries();
  const countryName = (code: string | null) => countries.find((c) => c.code === code)?.name ?? "Not set";
  const [country, setCountry] = useState(account.country ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const act = async (path: string, body: object, then: string) => {
    setBusy(true);
    setError("");
    const { data } = await post<{ ok: boolean }>(path, body);
    if (data.ok) window.location.replace(then);
    else {
      setError("That didn't work. Please try again.");
      setBusy(false);
    }
  };

  return (
    <Frame label="Your account">
      <div>
        <h1 className="signin__title">{account.name}</h1>
        <p className="signin__lede">
          Signed in{account.email ? ` as ${account.email}` : ""}
          {account.google ? " with Google" : ""}. Your progress follows you to any device you sign in on.
        </p>
      </div>
      {/* Near the top, so it's easy to get back to the game (Nav, prompt 34). */}
      <Link className="pbtn pbtn--blue pbtn--block signin__back" href="/">
        Back to the mission
      </Link>

      <Window className="signin__card">
        <h2 className="signin__label">COUNTRY</h2>
        <p className="signin__value">{countryName(account.country)}</p>
        {account.countryChangeable ? (
          <form
            className="signin__form"
            onSubmit={(e) => {
              e.preventDefault();
              if (country && country !== account.country) void act("/api/auth/country", { country }, "/sign-in");
            }}
          >
            <label className="signin__field">
              <span className="signin__small">Wrong? You can change it once, for the country leaderboard.</span>
              <select className="signin__input signin__select" value={country} onChange={(e) => setCountry(e.target.value)}>
                {!account.country && <option value="">Choose…</option>}
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <PixelButton type="submit" variant="outline" block disabled={busy || !country || country === account.country}>
              Change country (once)
            </PixelButton>
          </form>
        ) : (
          <p className="signin__small">You've used your one change.</p>
        )}
      </Window>

      <PixelButton block variant="outline" disabled={busy} onClick={() => void act("/api/auth/sign-out", {}, "/")}>
        Sign out
      </PixelButton>
      <p className="signin__small">
        Signing out keeps your progress in your account. This device carries on as a new guest.
      </p>

      <Window tone="orange" className="signin__card">
        <h2 className="signin__label signin__label--orange">DELETE ACCOUNT</h2>
        <p className="signin__small signin__small--warm">
          Deletes your account, its name and its progress (credits, upgrades, patches and badges) for good. The km you
          pushed stay in the mission, without your name. This can't be undone.
        </p>
        <PixelButton
          variant="orange"
          block
          disabled={busy}
          onClick={() => (confirmDelete ? void act("/api/auth/delete", {}, "/") : setConfirmDelete(true))}
        >
          {confirmDelete ? "Tap again: delete for good" : "Delete my account"}
        </PixelButton>
      </Window>

      {error && (
        <p className="signin__error" role="alert">
          {error}
        </p>
      )}
      <p className="signin__small">
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/contact">Contact</a>
      </p>
    </Frame>
  );
}

// ---------- /sign-in/confirm: the email link ----------

const CONFIRM_ERRORS: Record<Extract<ConfirmResult, { ok: false }>["reason"], string> = {
  invalid: "This link doesn't work. Ask for a new one.",
  expired: "This link has expired (they last 15 minutes). Ask for a new one.",
  used: "This link has already been used. Ask for a new one if you need to.",
  "no-device": "Open the game first, then use the link again.",
};

export function ConfirmPage() {
  useDocumentTitle("Sign in · OneSmallClick");
  const token = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : CONFIRM_ERRORS.invalid);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      // The session needs this browser's device cookie: make sure it has one.
      await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
      const { data } = await post<ConfirmResult>("/api/auth/confirm", { t: token });
      if (data.ok) {
        window.location.replace("/sign-in");
        return;
      }
      setError(CONFIRM_ERRORS[data.reason] ?? CONFIRM_ERRORS.invalid);
    } catch {
      setError("We couldn't reach the probe. Please try again.");
    }
    setBusy(false);
  };

  return (
    <Frame label="Sign in">
      <div>
        <h1 className="signin__title">Sign in to OneSmallClick</h1>
        <p className="signin__lede">Press the button to sign in on this device. Your progress here joins your account.</p>
      </div>
      {token && (
        <PixelButton block size="lg" disabled={busy} onClick={() => void confirm()}>
          {busy ? "Signing in…" : "Sign in"}
        </PixelButton>
      )}
      {error && (
        <p className="signin__error" role="alert">
          {error}
        </p>
      )}
      <Link href="/sign-in" className="signin__guest">
        Ask for a new link
      </Link>
    </Frame>
  );
}
