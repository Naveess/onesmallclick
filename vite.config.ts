import { defineConfig, type Plugin } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// `npm run dev` runs the React app and the Worker (worker/index.ts) together in workerd.
// `npm run build` writes the app and the Worker to dist/, which `wrangler deploy` ships.
// JSX is compiled by Vite itself (no React plugin, to keep dependencies to the agreed list),
// so edits reload the page instead of hot-swapping components.
/**
 * In dev, serve the content pages (public/*.html, made by scripts/build-pages.mjs) at the same clean
 * addresses Cloudflare uses in production: /how-to-play → how-to-play.html. Production needs nothing:
 * static assets already work that way.
 */
function contentPages(): Plugin {
  return {
    name: "osc-content-pages",
    configureServer(server) {
      server.middlewares.use((request, _res, next) => {
        const req = request as unknown as { url?: string }; // no Node types in this config's tsconfig
        const [path, query] = (req.url ?? "").split("?");
        if (/^\/(how-to-play|privacy|terms|contact|milestones\/[a-z0-9-]+|destinations\/[a-z0-9-]+)$/.test(path)) req.url = `${path}.html${query ? `?${query}` : ""}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [contentPages(), cloudflare()],
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
});
