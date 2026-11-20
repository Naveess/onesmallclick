import { AdminPage } from "./pages/AdminPage";
import { GamePage } from "./pages/GamePage";
import { KitPage } from "./pages/KitPage";
import { LogPage } from "./pages/LogPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ConfirmPage, SignInPage } from "./pages/SignInPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RanksPage } from "./pages/RanksPage";
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
      return <LogPage />;
    case "/ranks":
      return <RanksPage />;
    case "/profile":
      return <ProfilePage />;
    case "/sign-in":
      return <SignInPage />;
    case "/sign-in/confirm":
      return <ConfirmPage />;
    default:
      return <NotFoundPage />;
  }
}
