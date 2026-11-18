import type { ElementType, HTMLAttributes, ReactNode } from "react";
import "./Window.css";

export type WindowTone = "blue" | "orange" | "muted" | "active";

interface WindowProps extends HTMLAttributes<HTMLElement> {
  /** blue: the standard window · orange: signal and milestones · muted: locked · active: highlighted */
  tone?: WindowTone;
  /** The element to render, e.g. "section" or "article". */
  as?: ElementType;
  children?: ReactNode;
}

/** The double-bordered window every panel sits in. */
export function Window({ tone = "blue", as: Tag = "div", className, children, ...rest }: WindowProps) {
  const classes = ["window", tone !== "blue" && `window--${tone}`, className].filter(Boolean).join(" ");
  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  );
}
