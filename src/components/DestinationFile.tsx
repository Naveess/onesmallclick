import { useEffect, useRef, useState } from "react";
import { factPath, type FactOfDay } from "../game/facts";
import { hms } from "../game/format";
import { shareCardPng } from "../game/shareCard";
import { PixelButton } from "./PixelButton";
import { PixelIcon } from "./PixelIcon";
import { Window } from "./Window";
import "./DestinationFile.css";

/** Each destination's sprites: the 32px icon on the card and the 128px planet on the share card. */
const ART: Record<string, { small: string; big: string }> = {
  mars: { small: "/sprites/mars-32.png", big: "/sprites/mars.png" },
};

interface DestinationFileProps {
  stop: string;
  destName: string;
  fact: FactOfDay;
  /** Seconds to the next fact (midnight UTC). */
  leftS: number;
  wide?: boolean;
}

/** The Destination file card (1a/1b, E4b part 1): today's fact about where we're going, and a card to share. */
export function DestinationFile({ stop, destName, fact, leftS, wide = false }: DestinationFileProps) {
  const [sharing, setSharing] = useState(false);
  const art = ART[stop];
  return (
    <Window as="section" className={wide ? "dest dest--wide" : "dest"} aria-labelledby="dest-label">
      <div className="dest__head">
        <h2 id="dest-label" className="dest__label">
          {art && <img src={art.small} alt="" width={32} height={32} />}
          DESTINATION FILE · {destName.toUpperCase()}
        </h2>
        <span className="dest__n num">
          Fact {fact.n} of {fact.total}
        </span>
      </div>
      <p className="dest__fact">{fact.fact}</p>
      <div className="dest__foot">
        <span className="dest__next">
          Next fact at 00:00 UTC · <span className="num">{hms(leftS)}</span>
        </span>
        <PixelButton
          className="dest__share"
          onClick={() => setSharing(true)}
          aria-haspopup="dialog"
          icon={<PixelIcon name="share" size={18} tone="blue" />}
        >
          Share fact
        </PixelButton>
      </div>
      {sharing && (
        <ShareFactDialog stop={stop} destName={destName} fact={fact} planet={art?.big} onClose={() => setSharing(false)} />
      )}
    </Window>
  );
}

interface ShareFactDialogProps {
  stop: string;
  destName: string;
  fact: FactOfDay;
  planet?: string;
  onClose: () => void;
}

/** "SHARE CARD · PREVIEW": the square card, Save image (a 1080 × 1080 PNG) and Copy link. A modal <dialog>. */
function ShareFactDialog({ stop, destName, fact, planet, onClose }: ShareFactDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  // What just happened, shown in the dialog (a toast would sit behind the modal's backdrop).
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const save = async () => {
    if (!planet) return;
    setSaving(true);
    try {
      const png = await shareCardPng({ destName, n: fact.n, fact: fact.fact, planetSrc: planet });
      const url = URL.createObjectURL(png);
      const a = document.createElement("a");
      a.href = url;
      a.download = `onesmallclick-${stop}-fact-${fact.n}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setStatus("Couldn't make the image in this browser. Copy the link instead.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    const url = `${window.location.origin}${factPath(stop, fact.n)}`;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied. Paste it anywhere.");
    } catch {
      setStatus(`Couldn't copy. The fact is at ${url}`);
    }
  };

  return (
    <dialog
      ref={ref}
      className="share-fact"
      aria-label="Share this fact"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close(); // a click on the backdrop
      }}
    >
      <div className="share-fact__window">
        <p className="share-fact__label">SHARE CARD · PREVIEW</p>
        <div
          className="share-card"
          role="img"
          aria-label={`Square share card: ${destName}, fact ${fact.n}: ${fact.fact} onesmallclick.io`}
        >
          {planet && <img className="share-card__planet" src={planet} alt="" width={128} height={128} />}
          <div className="share-card__label">
            DESTINATION FILE
            <br />
            {destName.toUpperCase()} · FACT {fact.n}
          </div>
          <div className="share-card__fact">{fact.fact}</div>
          <div className="share-card__foot">
            <span className="share-card__name">OneSmallClick</span>
            <span className="share-card__url">onesmallclick.io</span>
          </div>
        </div>
        <div className="share-fact__buttons">
          <PixelButton onClick={() => void save()} disabled={saving || !planet} aria-busy={saving}>
            {saving ? "Saving…" : "Save image"}
          </PixelButton>
          <PixelButton onClick={() => void copy()}>Copy link</PixelButton>
        </div>
        <PixelButton variant="outline" className="share-fact__close" onClick={() => ref.current?.close()} autoFocus>
          Close
        </PixelButton>
        <p className="share-fact__note" aria-live="polite">
          {status ?? "Saves as a 1080 × 1080 PNG"}
        </p>
      </div>
    </dialog>
  );
}
