import { KitPage } from "./pages/KitPage";
import { LaunchPage } from "./pages/LaunchPage";
import { NotFoundPage } from "./pages/NotFoundPage";

// Two pages for now, so no router library: the Worker serves index.html for every path
// (not_found_handling in wrangler.jsonc) and the app picks the page from the URL.
export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return <LaunchPage />;
  if (path === "/kit") return <KitPage />;
  return <NotFoundPage />;
}
