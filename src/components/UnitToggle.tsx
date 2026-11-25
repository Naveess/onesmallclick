import { setUnit, useUnit } from "../game/units";
import type { Unit } from "../../shared/units";
import "./UnitToggle.css";

const UNITS: { unit: Unit; label: string; name: string }[] = [
  { unit: "km", label: "KM", name: "kilometres" },
  { unit: "mi", label: "MI", name: "miles" },
];

/** KM | MI (prompts 107–108): which unit the game's numbers show. Saved in this browser; every page follows it. */
export function UnitToggle({ className }: { className?: string }) {
  const current = useUnit();
  return (
    <div className={className ? `units ${className}` : "units"} role="group" aria-label="Distance units">
      {UNITS.map(({ unit, label, name }) => (
        <button
          key={unit}
          type="button"
          className={unit === current ? "units__btn units__btn--on" : "units__btn"}
          aria-pressed={unit === current}
          aria-label={`Show ${name}`}
          onClick={() => setUnit(unit)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
