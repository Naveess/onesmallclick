import { PixelIcon } from "../components/PixelIcon";
import { Sky } from "../components/Sky";
import { Window } from "../components/Window";
import { useDocumentTitle } from "./useDocumentTitle";
import "./SimplePage.css";

/** Any path the app doesn't know. */
export function NotFoundPage() {
  useDocumentTitle("Lost signal · OneSmallClick");
  return (
    <>
      <Sky fixed />
      <div className="launch">
        <main className="launch__main">
          <Window as="section" className="launch__card" aria-labelledby="lost-title">
            <PixelIcon name="signal" tone="orange" size={36} />
            <h1 id="lost-title" className="launch__title">
              Lost signal
            </h1>
            <p className="launch__lede">There's nothing at this address.</p>
            <a href="/">Back to OneSmallClick</a>
          </Window>
        </main>
      </div>
    </>
  );
}
