// Builds the plain HTML content pages (phase 7b) into public/, before Vite runs:
//   public/how-to-play.html            → /how-to-play        (the design's 1l)
//   public/milestones/<slug>.html      → /milestones/<slug>  (one fact page per milestone)
//   public/content.css                 → their stylesheet (the game's fonts, theme and kit, plus src/content/pages.css)
// The text is in the HTML itself, so search engines (and AdSense) can read it without running scripts.
// Content: content/milestones.json. These outputs are generated, so they're git-ignored.
// Runs on `npm run dev` and `npm run build`. No dependencies: plain Node.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const out = (p, text) => {
  const file = join(root, "public", p);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const { milestones } = JSON.parse(read("content/milestones.json"));
const gb = new Intl.NumberFormat("en-GB");

// ---------- The stylesheet ----------

const css = [
  "src/styles/fonts.css",
  "src/styles/theme.css",
  "src/styles/base.css",
  "src/components/Window.css",
  "src/components/PixelButton.css",
  "src/components/Sky.css",
  "src/components/Postcard.css",
  "src/content/pages.css",
]
  .map((p) => `/* ${p} */\n${read(p)}`)
  .join("\n");
const cssVersion = createHash("sha256").update(css).digest("hex").slice(0, 10);

// ---------- Helpers ----------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A design icon (design/icons/*.svg, 9×9, currentColor) at a whole-number scale. */
const icon = (name, size = 18) =>
  read(`design/icons/${name}.svg`)
    .trim()
    .replace(/width="9" height="9"/, `width="${size}" height="${size}" aria-hidden="true" focusable="false"`);

function page({ path, title, description, body, current }) {
  const nav = [
    ["/", "Play"],
    ["/how-to-play", "How to play"],
    ["/log", "Mission log"],
  ]
    .map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("\n          ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="theme-color" content="#0e1a40" />
    <link rel="icon" href="/sprites/probe.png" type="image/png" />
    <link rel="preload" href="/fonts/pixelify-sans-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="preload" href="/fonts/vt323-latin.woff2" as="font" type="font/woff2" crossorigin />
    <!-- The saved theme, else the system setting (same key as the game: src/theme.ts). -->
    <script>
      (function () {
        var t = null;
        try { t = localStorage.getItem("osc-theme"); } catch (e) {}
        if (t !== "light" && t !== "dark") t = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
        document.documentElement.dataset.theme = t;
        if (t === "light") document.querySelector('meta[name="theme-color"]').setAttribute("content", "#b8dcff");
      })();
    </script>
    <style>
      html { background: #02040b; }
      html[data-theme="light"] { background: #e9eef7; }
    </style>
    <link rel="stylesheet" href="/content.css?v=${cssVersion}" />
  </head>
  <body>
    <div class="sky sky--fixed" aria-hidden="true">
      <div class="sky__nebula"></div>
      <div class="sky__stars sky__stars--far"></div>
      <div class="sky__stars sky__stars--near"></div>
    </div>
    <div class="page" data-path="${esc(path)}">
      <header class="page__head">
        <a class="page__brand" href="/">OneSmallClick</a>
        <nav class="page__nav" aria-label="Site">
          ${nav}
          <button type="button" class="page__theme" id="theme-toggle">Light mode</button>
        </nav>
      </header>
      <main class="page__body" aria-labelledby="page-title">
${body}
      </main>
      <aside class="ad-slot" aria-label="Advertisement">
        <div class="ad-slot__label" aria-hidden="true">ADVERTISEMENT</div>
        <div class="ad-slot__box">AD SLOT · 320×100</div>
      </aside>
      <footer class="page__foot">
        <a href="/">Play OneSmallClick</a>
        <a href="/how-to-play">How to play</a>
        <a href="/log">Mission log</a>
      </footer>
    </div>
    <script>
      (function () {
        var b = document.getElementById("theme-toggle");
        var label = function () { b.textContent = document.documentElement.dataset.theme === "light" ? "Dark mode" : "Light mode"; };
        label();
        b.addEventListener("click", function () {
          var t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
          document.documentElement.dataset.theme = t;
          try { localStorage.setItem("osc-theme", t); } catch (e) {}
          label();
        });
        // With no saved choice, follow the system setting live, as the game does.
        window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", function (e) {
          var saved = null;
          try { saved = localStorage.getItem("osc-theme"); } catch (x) {}
          if (saved === "light" || saved === "dark") return;
          document.documentElement.dataset.theme = e.matches ? "light" : "dark";
          label();
        });
      })();
    </script>
  </body>
</html>
`;
}

function milestoneList() {
  return `<ol class="milestones">
${milestones
  .map(
    (m) => `          <li><a href="/milestones/${m.slug}"><span class="milestones__n">${m.n}</span><span class="milestones__name">${esc(m.name)}</span><span class="milestones__km">${gb.format(m.km)} km</span></a></li>`,
  )
  .join("\n")}
        </ol>`;
}

// ---------- How to play (1l) ----------

const steps = [
  ["up", false, "Tap THRUST", "Every tap from every player pushes the same probe toward Mars."],
  ["signal", true, "Keep the signal alive", "If the timer hits zero the probe goes quiet. Anyone can Ping once a day to reset it."],
  ["check", false, "Vote the route", "One crew vote a day: faster, safer, or a detour for a postcard."],
  ["bolt", false, "Upgrade your thrusters", "They keep pushing while you're away, for up to 8 hours."],
];

const howToPlay = page({
  path: "/how-to-play",
  current: "/how-to-play",
  title: "How to play · OneSmallClick",
  description:
    "How OneSmallClick works: everyone taps THRUST to push one shared probe from Earth to Mars, keeps its signal alive with a daily Ping, and votes on the route.",
  body: `      <div>
        <p class="page__label">HOW TO PLAY</p>
        <h1 id="page-title" class="page__title">One probe.<br />Everyone's taps.</h1>
      </div>
      <ol class="steps">
${steps
  .map(
    ([ic, orange, title, text], i) => `        <li class="window step">
          <span class="step__icon${orange ? " step__icon--orange" : ""}">${icon(ic)}</span>
          <div>
            <h2 class="step__title"><span class="step__n${orange ? " step__n--orange" : ""}">${i + 1}</span> ${esc(title)}</h2>
            <p class="step__text">${esc(text)}</p>
          </div>
        </li>`,
  )
  .join("\n")}
      </ol>
      <p class="page__note">The big date on the home screen moves with all of us. More play, sooner arrival.</p>
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Start pushing</a>
      <section aria-labelledby="milestones-title">
        <h2 id="milestones-title" class="page__h2">Six milestones on the way</h2>
        <p class="page__note">Each one unlocks a postcard and a fact from the flight deck.</p>
        ${milestoneList()}
      </section>`,
});

// ---------- One fact page per milestone ----------

function factPage(m, i) {
  const prev = milestones[i - 1];
  const next = milestones[i + 1];
  const card = String(m.n).padStart(2, "0");
  return page({
    path: `/milestones/${m.slug}`,
    title: `${m.name}: milestone ${m.n} of ${milestones.length} · OneSmallClick`,
    description: m.description,
    body: `      <div>
        <p class="page__label page__label--orange">MILESTONE ${m.n} OF ${milestones.length} · ${gb.format(m.km)} KM FROM EARTH</p>
        <h1 id="page-title" class="page__title">${esc(m.name)}</h1>
      </div>
      <section class="window window--orange fact" aria-labelledby="fact-label">
        <h2 id="fact-label" class="fact__label">FROM THE FLIGHT DECK</h2>
        <p>${esc(m.fact)}</p>
        <p>${esc(m.sub)}</p>
      </section>
      <figure class="postcard">
        <div class="postcard__photo">
          <p class="postcard__soon">Postcard photo coming soon</p>
          <div class="postcard__stamp" aria-hidden="true"><img src="/sprites/mars-32.png" alt="" width="32" height="32" /></div>
        </div>
        <figcaption class="postcard__caption"><span>Wish you were here. — OSC-1</span><span class="postcard__no num">POSTCARD ${card}</span></figcaption>
      </figure>
      <section class="window prose" aria-label="About this milestone">
${m.page.map((p) => `        <p>${esc(p)}</p>`).join("\n")}
      </section>
      <section class="sources" aria-labelledby="sources-title">
        <h2 id="sources-title">Sources</h2>
        <ul>
${m.sources.map((s) => `          <li><a href="${esc(s.url)}" rel="noopener">${esc(s.label)}</a></li>`).join("\n")}
        </ul>
      </section>
      <nav class="page__links" aria-label="Milestones">
        ${prev ? `<a href="/milestones/${prev.slug}">← ${prev.n}. ${esc(prev.name)}</a>` : "<span></span>"}
        ${next ? `<a href="/milestones/${next.slug}">${next.n}. ${esc(next.name)} →</a>` : "<span></span>"}
      </nav>
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Help push the probe</a>
      <section aria-labelledby="milestones-title">
        <h2 id="milestones-title" class="page__h2">All six milestones</h2>
        ${milestoneList()}
      </section>`,
  });
}

// ---------- Privacy (phase 8a: sign-in starts storing email addresses) ----------

const PRIVACY_UPDATED = "20 November 2026";
const privacySections = [
  [
    "Playing as a guest",
    [
      "The first time you open the game, your browser gets a random device id in a cookie (osc_device). It's signed so nobody can fake it, and it holds nothing about you. It lasts up to 400 days.",
      "With it we keep your generated name (like orbit_otter), the country Cloudflare's network says you're visiting from (the country only, worked out once when the id is made), when you first and last played, and your game: the km and THRUST clicks you push each day, your pings and votes, your credits, upgrades and patches, and the badges you earn. For the Night Shift badge, the game checks the time zone Cloudflare’s network gives for your connection while you tap; it isn’t stored.",
      "Your browser also keeps a few things for itself: your light or dark theme, a copy of the probe's position so the page opens fast, and which milestone moments you've already seen.",
    ],
  ],
  [
    "Signing in",
    [
      "Signing in is optional. If you sign in with an email link, we keep your email address. If you sign in with Google, we keep your email address and Google's id for your account, and nothing else from Google: no name, no photo, no contacts.",
      "Your account also has its generated crew name and a country (detected when the account is made; you can change it once). A sign-in cookie (osc_session) keeps you signed in for up to 90 days; a short cookie (osc_oauth) lasts 10 minutes while you're away at Google.",
      "A sign-in link is stored only as a scrambled code (a hash), and it stops working after one use or 15 minutes.",
    ],
  ],
  [
    "What other players see",
    [
      "Your crew name, never your email. It can appear in the mission log (for example “Signal restored by orbit_otter”), and on the leaderboards (signed-in players only; the countries board counts everyone’s km by country, without names), and in the mission credits when they arrive.",
    ],
  ],
  [
    "Who else handles it",
    [
      "Cloudflare runs the whole site: the pages, the game server and the database. Its network handles your IP address to deliver the site, and the game server keeps short-lived logs for fixing problems.",
      "Ping, the daily vote and the email sign-in use Cloudflare Turnstile, an invisible check that you're not a bot. It runs in your browser and Cloudflare processes signals from it for that check only. See Cloudflare's <a href=\"https://www.cloudflare.com/turnstile-privacy-policy/\" rel=\"noopener\">Turnstile Privacy Addendum</a>.",
      "Sign-in emails are sent with Cloudflare's Email Service. Google sees that you signed in to OneSmallClick if you use “Continue with Google”.",
      "There are no ads, no analytics trackers and no Google scripts on our pages. We never sell your data and never post anything for you.",
    ],
  ],
  [
    "Your choices",
    [
      "Sign out at any time: your progress stays with your account, and the device carries on as a new guest.",
      "Delete your account from the sign-in page: your email, name and account progress are deleted straight away (the database's own backups roll off within 30 days). The km you pushed stay in the mission without your name.",
      "For a copy of your data, or anything else about privacy, email <a href=\"mailto:privacy@onesmallclick.io\">privacy@onesmallclick.io</a>.",
    ],
  ],
];

const privacy = page({
  path: "/privacy",
  current: "/privacy",
  title: "Privacy · OneSmallClick",
  description: "What OneSmallClick stores about you, why, who else handles it, and how to delete it.",
  body: `      <div>
        <p class="page__label">PRIVACY</p>
        <h1 id="page-title" class="page__title">What we keep, and why</h1>
      </div>
      <p class="page__note">The short version: a random id for your device, your game, and your email only if you sign in. Updated ${PRIVACY_UPDATED}.</p>
${privacySections
  .map(
    ([title, paras], i) => `      <section class="window prose" aria-labelledby="privacy-${i}">
        <h2 id="privacy-${i}" class="page__h2">${esc(title)}</h2>
${paras.map((p) => `        <p>${p}</p>`).join("\n")}
      </section>`,
  )
  .join("\n")}
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Back to the mission</a>`,
});

// ---------- Write ----------

rmSync(join(root, "public", "milestones"), { recursive: true, force: true });
out("content.css", css);
out("how-to-play.html", howToPlay);
out("privacy.html", privacy);
milestones.forEach((m, i) => out(`milestones/${m.slug}.html`, factPage(m, i)));
console.log(`build-pages: how-to-play, privacy + ${milestones.length} milestone pages, content.css ${cssVersion}`);
