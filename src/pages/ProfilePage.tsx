import { useEffect, useState } from "react";
import { BADGE_INFO, KEEPER_IDS, ROMAN, type BadgeId } from "../../shared/badges";
import type { ProfileInfo } from "../../shared/boards";
import { CLICK_BADGES } from "../../shared/clicks";
import { GameShell } from "../components/GameShell";
import { share, shareText } from "../components/MilestoneMoment";
import { PixelButton } from "../components/PixelButton";
import { PixelIcon, type IconTone } from "../components/PixelIcon";
import type { IconName } from "../components/iconPaths";
import { countryName } from "../game/countries";
import { int, millionsKm } from "../game/format";
import { useGame } from "../game/store";
import { Link } from "../router";
import { useDocumentTitle } from "./useDocumentTitle";
import "./ProfilePage.css";

// /profile: the profile (1j, phase 8b). Badges, distance and the 30-day ping grid.
// The passport and cosmetics in the design wait for the arrival rewards (8c; decided in prompt 38).

async function fetchProfile(): Promise<ProfileInfo> {
  const res = await fetch("/api/profile", { cache: "no-store", credentials: "same-origin" });
  if (!res.ok) throw new Error(`profile ${res.status}`);
  return res.json();
}

interface Tile {
  key: string;
  name: string;
  how: string;
  icon: IconName;
  tone: IconTone;
  on: boolean;
}

/**
 * The badge tiles, in the design's order. Signal Keeper is one tile showing your highest level
 * (or what Signal Keeper I needs). Icons are the design's 9×9 ones until the PixelLab sprites exist.
 */
function tiles(have: Set<BadgeId>): Tile[] {
  const keeper = [...KEEPER_IDS].reverse().find((id) => have.has(id));
  const keeperShown = keeper ?? KEEPER_IDS[0];
  const t = (id: BadgeId, icon: IconName, tone: IconTone): Tile => ({
    key: id,
    name: BADGE_INFO[id].name,
    how: BADGE_INFO[id].how,
    icon,
    tone,
    on: have.has(id),
  });
  return [
    { ...t(keeperShown, "signal", "orange"), key: "keeper", on: keeper !== undefined },
    t("first-ping", "star", "orange"),
    t("night-shift", "clock", "blue"),
    t("voter-30", "check", "blue"),
    t("halfway", "trophy", "orange"),
    t("patch", "star", "blue"),
    t("clicks-1", "up", "blue"),
    t("clicks-2", "up", "blue"),
    t("clicks-3", "up", "orange"),
  ];
}

export function ProfilePage() {
  useDocumentTitle("Profile · OneSmallClick");
  const { player, view } = useGame();
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchProfile()
      .then((p) => alive && setInfo(p))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const have = new Set(player.badges.map((b) => b.id));
  const shownTiles = tiles(have);
  const earned = shownTiles.filter((x) => x.on).length;
  const pinged = new Set(info?.pingDays ?? []);
  const keeperLevel = KEEPER_IDS.filter((id) => have.has(id)).length;
  const streak = player.pingStreakDays;
  const today = info?.days[info.days.length - 1];

  return (
    <GameShell tab="other">
      {({ wide }) => (
        <main className={wide ? "profile profile--wide" : "profile"} aria-labelledby="profile-title">
          <header className="profile__head">
            <div className="profile__avatar">
              <PixelIcon name="user" size={36} tone="blue" />
            </div>
            <div>
              <h1 id="profile-title" className="profile__name">
                {info?.name || player.name}
              </h1>
              <p className="profile__sub">
                {info ? `Crew since day ${Math.max(1, view.missionDayAt(info.joinedAt))} · ${countryName(info.country)}` : " "}
              </p>
            </div>
          </header>

          {error && <p className="profile__note">We couldn't load your profile. Please reload the page.</p>}

          <div className="profile__stats">
            <div className="profile__stat">
              <div className="profile__stat-label">TOTAL PUSHED</div>
              <div className="profile__stat-value num profile__stat-value--blue">{info ? (info.totalKm < 1e6 ? `${int(info.totalKm)} km` : millionsKm(info.totalKm)) : "…"}</div>
            </div>
            <div className="profile__stat">
              <div className="profile__stat-label">TODAY</div>
              <div className="profile__stat-value num">{int(player.kmToday)} km</div>
            </div>
            <div className="profile__stat">
              <div className="profile__stat-label">PINGS</div>
              <div className="profile__stat-value num profile__stat-value--orange">{info ? `${pinged.size} / 30` : "…"}</div>
            </div>
          </div>

          <section className="profile__section" aria-labelledby="badges-label">
            <h2 id="badges-label" className="profile__label">
              BADGES · {earned} OF {shownTiles.length}
            </h2>
            <ul className="profile__badges">
              {shownTiles.map((b) => (
                <li key={b.key} className={b.on ? "profile__badge profile__badge--on" : "profile__badge"}>
                  <PixelIcon name={b.icon} size={27} tone={b.on ? b.tone : "muted"} />
                  <span className="profile__badge-name">{b.name}</span>
                  <span className="profile__badge-how">{b.how}</span>
                  <span className="visually-hidden">{b.on ? "Earned" : "Not earned yet"}</span>
                </li>
              ))}
            </ul>
            <p className="profile__note">
              Click badges count all your clicks: {CLICK_BADGES.map((c) => int(c.clicks)).join(", ")}. You've clicked{" "}
              {int(player.tapsAll)} times.
            </p>
          </section>

          <section className="profile__section" aria-labelledby="pings-label">
            <h2 id="pings-label" className="profile__label profile__label--row">
              <span>PING HISTORY · LAST 30 DAYS</span>
              <span className="profile__streak">
                {streak}-DAY STREAK{keeperLevel > 0 ? ` · KEEPER ${ROMAN[keeperLevel - 1]}` : ""}
              </span>
            </h2>
            <div className="profile__pings" role="img" aria-label={`Pinged on ${pinged.size} of the last 30 days`}>
              {(info?.days ?? Array.from({ length: 30 }, (_, i) => String(i))).map((d) => (
                <span
                  key={d}
                  className={[
                    "profile__ping",
                    pinged.has(d) && "profile__ping--on",
                    d === today && "profile__ping--today",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                />
              ))}
            </div>
            <div className="profile__legend">
              <span>
                <span className="profile__key profile__key--on" />
                Pinged
              </span>
              <span>
                <span className="profile__key" />
                Missed
              </span>
            </div>
          </section>

          <div className="profile__actions">
            <PixelButton
              variant="blue"
              onClick={() =>
                void share(
                  shareText({
                    missionDay: view.missionDay,
                    progress: view.progress,
                    kmToday: player.kmToday,
                    arrivalAt: view.arrivalAt,
                    now: Date.now(),
                  }),
                )
              }
            >
              Share my mission card
            </PixelButton>
            <Link href="/sign-in" className="profile__account">
              {player.account ? "Account" : "Sign in"}
            </Link>
          </div>
          {!player.account && (
            <p className="profile__note">
              You're playing as a guest. <Link href="/sign-in">Sign in</Link> to keep your badges on every device and to
              appear on the leaderboard.
            </p>
          )}
        </main>
      )}
    </GameShell>
  );
}
