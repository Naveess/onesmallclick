import { useEffect, useRef, useState, type ReactNode } from "react";
import { CHANNEL_NAMES, channelHref, crewUrl, type Channel, type Moment } from "../../shared/share";
import { countShare, crewCode } from "../game/share";
import { PixelButton } from "./PixelButton";
import "./ShareSheet.css";

type Moments = Exclude<Moment, "page">;

interface ShareSheetProps {
  moment: Moments;
  /** What exactly was shared (a milestone's number, a stop, a badge, "mars-12" for a fact), for the link preview. */
  detail?: string;
  /** The message, before the crew link (content/share.json). */
  text: string;
  /** The dialog's heading, e.g. "Share this milestone". */
  title: string;
  /** Shown above the message, e.g. the fact's square card. */
  children?: ReactNode;
  /** More buttons under the share buttons, e.g. "Save image". */
  extra?: ReactNode;
  /** A line from the parent (e.g. the image is saving); otherwise the sheet's own. */
  note?: string | null;
  onClose: () => void;
}

const APPS: Exclude<Channel, "sheet" | "copy">[] = ["wa", "x", "fb", "rd", "tg"];

/** One share kit everywhere (phase S1, decision 28): the phone's own share sheet first, then WhatsApp, X, Facebook,
 * Reddit, Telegram and Copy. Plain links, no share SDKs. Every link is the sharer's crew link. A modal <dialog>. */
export function ShareSheet({ moment, detail, text, title, children, extra, note, onClose }: ShareSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState<string | null | undefined>(undefined); // undefined while asking
  const [status, setStatus] = useState<string | null>(null);
  const native = typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    let alive = true;
    void crewCode().then((c) => alive && setCode(c));
    return () => {
      alive = false;
    };
  }, []);

  const origin = window.location.origin;
  // Without a code (offline, or no device yet) the link is the game itself: the share still works, uncounted as a crew link.
  const url = (channel: Channel) => (code ? crewUrl(origin, code, moment, channel, detail) : `${origin}/`);
  const ready = code !== undefined;

  const shareNative = async () => {
    countShare(moment, "sheet");
    try {
      await navigator.share({ title: "OneSmallClick", text, url: url("sheet") });
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") setStatus("Your phone didn't open its share sheet. Try a button below.");
    }
  };

  const copy = async () => {
    countShare(moment, "copy");
    const all = `${text}\n${url("copy")}`;
    try {
      await navigator.clipboard.writeText(all);
      setStatus("Copied the message and your crew link. Paste it anywhere.");
    } catch {
      setStatus(`Couldn't copy. Your crew link: ${url("copy")}`);
    }
  };

  return (
    <dialog
      ref={ref}
      className="share-sheet"
      aria-labelledby="share-sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close(); // a click on the backdrop
      }}
    >
      <div className="share-sheet__window">
        <p className="share-sheet__label">SHARE · YOUR CREW LINK</p>
        <h2 id="share-sheet-title" className="share-sheet__title">
          {title}
        </h2>
        {children}
        <p className="share-sheet__text" aria-label="The message">
          {text}
          <span className="share-sheet__url">{ready ? url("copy").replace(/\?.*$/, "") : "Making your crew link…"}</span>
        </p>
        {native && (
          <PixelButton block size="lg" disabled={!ready} onClick={() => void shareNative()}>
            Share…
          </PixelButton>
        )}
        <div className="share-sheet__apps">
          {APPS.map((c) =>
            ready ? (
              <a
                key={c}
                className="pbtn pbtn--outline share-sheet__app"
                href={channelHref(c, url(c), text)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => countShare(moment, c)}
              >
                {CHANNEL_NAMES[c]}
              </a>
            ) : (
              <span key={c} className="pbtn pbtn--outline share-sheet__app" aria-disabled="true">
                {CHANNEL_NAMES[c]}
              </span>
            ),
          )}
          <PixelButton variant="outline" className="share-sheet__app" disabled={!ready} onClick={() => void copy()}>
            Copy
          </PixelButton>
        </div>
        {extra && <div className="share-sheet__extra">{extra}</div>}
        <PixelButton variant="outline" className="share-sheet__close" onClick={() => ref.current?.close()} autoFocus>
          Close
        </PixelButton>
        <p className="share-sheet__note" aria-live="polite">
          {note ?? status ?? "Friends who open your link land straight in the game."}
        </p>
      </div>
    </dialog>
  );
}
