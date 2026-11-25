import { withMiles } from "../../shared/units";
import { useUnits } from "../game/units";
import { useEffect, useRef, useState } from "react";
import type { GameView, PlayerState } from "../game/store";
import { int } from "../game/format";
import { PRESTIGE_AT_KM, type UpgradeKey } from "../game/rules";
import { PixelButton } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import { Window } from "./Window";
import "./UpgradesSheet.css";

/** How long "Tap again to hand over" waits for the second tap. */
const CONFIRM_MS = 5_000;

interface UpgradesSheetProps {
  open: boolean;
  onClose: () => void;
  player: PlayerState;
  /** False while there's no line to the probe: purchases need the server. */
  live: boolean;
  view: GameView;
  onBuy: (key: UpgradeKey) => void;
  onHandOver: () => void;
}

/** The upgrades sheet. A real modal <dialog>: focus stays inside, Esc and the backdrop close it. */
export function UpgradesSheet({ open, onClose, player, live, view, onBuy, onHandOver }: UpgradesSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);
  const units = useUnits();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
    if (!open) setConfirming(false);
  }, [open]);

  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => window.clearTimeout(t);
  }, [confirming]);

  const { credits, kmSinceShift, patches, buying } = player;
  const prestigePct = Math.min(100, Math.floor((kmSinceShift / PRESTIGE_AT_KM) * 100));
  const rows = (group: "auto" | "tap") =>
    view.upgrades
      .filter((u) => u.def.group === group)
      .map((u) => (
        <div key={u.def.key} className="upgrade">
          <div className="upgrade__icon" aria-hidden="true">
            <PixelIcon name={u.def.icon} size={18} tone="blue" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="upgrade__name">
              <span>{u.def.name}</span>
              <span className="upgrade__level">LV {u.level}</span>
            </div>
            <div className="upgrade__effect">{u.def.effect}</div>
          </div>
          <PixelButton
            className="upgrade__buy"
            disabled={!u.affordable || !live || buying !== null}
            aria-busy={buying === u.def.key}
            onClick={() => onBuy(u.def.key)}
            aria-label={`Buy ${u.def.name} level ${u.level + 1} for ${int(u.cost)} credits`}
          >
            {int(u.cost)} cr
          </PixelButton>
        </div>
      ));

  const handOver = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onHandOver();
  };

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // a click on the backdrop
      }}
    >
      <button type="button" className="sheet__grab" onClick={onClose} aria-label="Close upgrades">
        <span />
      </button>
      <div className="sheet__head">
        <div>
          <h2 id="sheet-title" className="sheet__title">
            Upgrades
          </h2>
          <div className="sheet__sub">1 credit for every km you push</div>
        </div>
        <div className="sheet__balance">
          <div className="sheet__balance-label">BALANCE</div>
          <div className="sheet__balance-value">{int(credits)} cr</div>
        </div>
      </div>

      <div className="sheet__body">
        <h3 className="sheet__group">
          <span className="sheet__group-name">AUTO-THRUSTERS · PUSH WHILE YOU'RE AWAY</span>
          <span className="sheet__group-rate">+{view.autoKmS.toFixed(2)}/s</span>
        </h3>
        {rows("auto")}

        <h3 className="sheet__group sheet__group--gap">
          <span className="sheet__group-name">TAP POWER</span>
          <span className="sheet__group-rate">+{units.fine(view.tapKm)} a tap</span>
        </h3>
        {rows("tap")}

        <Window tone="orange" className="prestige">
          <div className="prestige__tag">
            <PixelIcon name="star" size={18} tone="orange" />
            PRESTIGE
          </div>
          <p className="prestige__title">Hand over the shift</p>
          <p className="prestige__note">
            Reset your upgrades and credits for 3 Mission Patches. Each patch is +10% thrust, forever.
            {patches > 0 && ` You have ${patches} (+${patches * 10}% thrust).`}
          </p>
          <div
            className="prestige__bar"
            role="progressbar"
            aria-label="Progress to prestige"
            aria-valuenow={prestigePct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="prestige__fill" style={{ width: `${prestigePct}%` }} />
          </div>
          <div className="prestige__numbers">
            <span>
              {units.num(Math.min(kmSinceShift, PRESTIGE_AT_KM))} / {units.dist(PRESTIGE_AT_KM)}
            </span>
            <span>{prestigePct}%</span>
          </div>
          {view.prestigeReady ? (
            <button
              type="button"
              className="prestige__locked prestige__go"
              disabled={!live || buying !== null}
              aria-busy={buying === "prestige"}
              onClick={handOver}
            >
              {confirming ? "Tap again: reset for 3 patches" : "Hand over the shift"}
            </button>
          ) : (
            <button type="button" className="prestige__locked" disabled>
              {withMiles(`Unlocks at ${int(PRESTIGE_AT_KM)} km pushed`)}
            </button>
          )}
        </Window>

        {!live && <p className="sheet__note">Reconnecting to the probe. Purchases need the line back.</p>}
      </div>
    </dialog>
  );
}
