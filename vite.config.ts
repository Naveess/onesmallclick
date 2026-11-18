import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// `npm run dev` runs the React app and the Worker (worker/index.ts) together in workerd.
// `npm run build` writes the app and the Worker to dist/, which `wrangler deploy` ships.
// JSX is compiled by Vite itself (no React plugin, to keep dependencies to the agreed list),
// so edits reload the page instead of hot-swapping components.
export default defineConfig({
  plugins: [cloudflare()],
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
});
