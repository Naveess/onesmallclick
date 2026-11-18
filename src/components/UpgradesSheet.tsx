import { useEffect, useRef } from "react";
import type { GameView } from "../game/store";
import { int } from "../game/format";
import type { UpgradeKey } from "../game/rules";
import { PixelButton } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import { Window } from "./Window";
import "./UpgradesSheet.css";

const PRESTIGE_AT_KM = 2_000_000;

interface UpgradesSheetProps {
  open: boolean;
  onClose: () => void;
  credits: number;
  lifetimeKm: number;
  view: GameView;
  onBuy: (key: UpgradeKey) => void;
}

/** The upgrades sheet. A real modal <dialog>: focus stays inside, Esc and the backdrop close it. */
export function UpgradesSheet({ open, onClose, credits, lifetimeKm, view, onBuy }: UpgradesSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const prestigePct = Math.min(100, Math.floor((lifetimeKm / PRESTIGE_AT_KM) * 100));
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
            disabled={!u.affordable}
            onClick={() => onBuy(u.def.key)}
            aria-label={`Buy ${u.def.name} level ${u.level + 1} for ${int(u.cost)} credits`}
          >
            {int(u.cost)} cr
          </PixelButton>
        </div>
      ));

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
          <div className="sheet__balance-value" aria-live="polite">
            {int(credits)} cr
          </div>
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
          <span className="sheet__group-rate">+{view.tapKm} km/tap</span>
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
              {int(Math.min(lifetimeKm, PRESTIGE_AT_KM))} / {int(PRESTIGE_AT_KM)} km
            </span>
            <span>{prestigePct}%</span>
          </div>
          <button type="button" className="prestige__locked" disabled>
            Unlocks at {int(PRESTIGE_AT_KM)} km pushed
          </button>
        </Window>

        <p className="sheet__note">Test flight: purchases last until you reload the page.</p>
      </div>
    </dialog>
  );
}
