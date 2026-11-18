import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./PixelButton.css";

export type ButtonVariant = "blue" | "outline" | "orange";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** blue: action · orange: signal (Ping, sharing a milestone) · outline: secondary */
  variant?: ButtonVariant;
  /** md is 46px tall, lg 52px. Both clear the 44px tap target. */
  size?: "md" | "lg";
  /** Fill the width of the parent. */
  block?: boolean;
  /** Shown before the text, e.g. a PixelIcon. */
  icon?: ReactNode;
  children?: ReactNode;
}

/** A real <button> in one of the design's three styles. */
export function PixelButton({
  variant = "blue",
  size = "md",
  block = false,
  icon,
  className,
  type = "button",
  children,
  ...rest
}: PixelButtonProps) {
  const classes = [
    "pbtn",
    `pbtn--${variant}`,
    size === "lg" && "pbtn--lg",
    block && "pbtn--block",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
