import { AdminPage } from "./pages/AdminPage";
import { GamePage } from "./pages/GamePage";
import { KitPage } from "./pages/KitPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { StubPage } from "./pages/StubPage";
import { usePath } from "./router";

// The Worker serves index.html for every path (not_found_handling in wrangler.jsonc)
// and the app picks the page from the URL (see router.ts).
export function App() {
  const path = usePath();
  switch (path) {
    case "/":
      return <GamePage />;
    case "/kit":
      return <KitPage />;
    case "/admin":
      return <AdminPage />;
    case "/log":
      return (
        <StubPage
          tab="log"
          title="Mission log"
          icon="log"
          note="Every vote, result, milestone, postcard and signal save, as a timeline. Arrives in phase 7."
        />
      );
    case "/ranks":
      return (
        <StubPage
          tab="ranks"
          title="Leaderboards"
          icon="trophy"
          note="Top players and countries by km pushed today. Arrives in phase 8."
        />
      );
    case "/how-to-play":
      return (
        <StubPage
          tab="other"
          title="How to play"
          icon="star"
          note="Tap THRUST, keep the signal alive, vote on the route. The full guide arrives in phase 7."
        />
      );
    case "/sign-in":
      return (
        <StubPage
          tab="other"
          title="Sign in"
          icon="mail"
          note="Sign in by email link or Google so your progress follows you. Arrives in phase 8. Playing without an account will always work."
        />
      );
    default:
      return <NotFoundPage />;
  }
}
