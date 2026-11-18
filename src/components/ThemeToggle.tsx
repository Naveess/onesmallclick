import { useTheme } from "../theme";
import { PixelButton } from "./PixelButton";

/** Switches between the night sky and daylight. The choice is saved in this browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <PixelButton variant="outline" onClick={toggle} aria-label={`Switch to ${next} mode`} className={className}>
      {next === "light" ? "Light mode" : "Dark mode"}
    </PixelButton>
  );
}
