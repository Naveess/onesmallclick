import { useState } from "react";
import { shareMessage, type Moment } from "../../shared/share";
import { PixelButton, type ButtonVariant } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import { ShareSheet } from "./ShareSheet";
import "./ShareSheet.css";

interface ShareNudgeProps {
  moment: Exclude<Moment, "page" | "result">;
  detail?: string;
  /** Fill-ins for the moment's message (content/share.json). */
  fill?: Record<string, string | number | null | undefined>;
  /** Picks the moment's second wording (messageAlt). */
  alt?: boolean;
  label: string;
  title: string;
  variant?: ButtonVariant;
  block?: boolean;
  className?: string;
}

/** A share button that opens the share kit for one moment (phase S1): the signal's final hour, safe mode,
 * the branch vote, arrival, a badge, your rank. */
export function ShareNudge({ moment, detail, fill = {}, alt, label, title, variant = "outline", block = true, className }: ShareNudgeProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PixelButton
        variant={variant}
        block={block}
        className={className ? `share-nudge ${className}` : "share-nudge"}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        icon={<PixelIcon name="share" size={18} tone={variant === "orange" ? "orange" : "blue"} />}
      >
        {label}
      </PixelButton>
      {open && (
        <ShareSheet moment={moment} detail={detail} text={shareMessage(moment, fill, alt)} title={title} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
