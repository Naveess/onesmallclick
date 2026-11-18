// The OneSmallClick Worker. Static files (the React app, sprites, fonts) are served
// before this runs; only /api/* reaches it (see run_worker_first in wrangler.jsonc).
// Phase 2 has no server state. The shared probe arrives in phase 4.

export default {
  async fetch(request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
