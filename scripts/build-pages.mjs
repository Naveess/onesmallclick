// Builds the plain HTML content pages (phase 7b) into public/, before Vite runs:
//   public/how-to-play.html            → /how-to-play        (the design's 1l)
//   public/milestones/<slug>.html      → /milestones/<slug>  (one fact page per milestone, every leg's from E3)
//   public/destinations/<stop>.html    → /destinations/<stop> (E4b part 1: a destination's 30 facts, one anchor each)
//   public/privacy.html, terms.html, contact.html → /privacy, /terms, /contact (8a; terms and contact from phase 9a)
//   public/content.css                 → their stylesheet (the game's fonts, theme and kit, plus src/content/pages.css)
// The text is in the HTML itself, so search engines (and AdSense) can read it without running scripts.
// Content: content/milestones/<stop>.json, content/facts/<stop>.json and content/campaign.json. These outputs
// are generated, so they're git-ignored. A file Nav hasn't approved yet ("approved": null) still gets its pages,
// for checking, but they're marked noindex and say DRAFT (E3).
// Runs on `npm run dev` and `npm run build`. No dependencies: plain Node.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const out = (p, text) => {
  const file = join(root, "public", p);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const jsonDir = (dir) =>
  readdirSync(join(root, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(read(`${dir}/${f}`)));
const { stops, probes } = JSON.parse(read("content/campaign.json"));
// Every leg's milestones (E3), Mars first. `milestones` is the Mars leg's, for How to play.
const legs = jsonDir("content/milestones").sort((a, b) => (a.stop === "mars" ? -1 : b.stop === "mars" ? 1 : 0));
const milestones = legs.find((l) => l.stop === "mars").milestones;
// Every destination with its facts written.
const destinations = jsonDir("content/facts");
const stopOf = (id) => stops.find((s) => s.id === id);
const nameOf = (id) => stopOf(id)?.name ?? id;
/** The probe flying the leg to `id` ("OSC-2"), as shared/campaign.ts probeFor() picks it. */
const probeTagOf = (id) => {
  const s = stopOf(id);
  const from = Array.isArray(s?.from) ? s.from[0] : s?.from;
  const pid = s?.probe ?? stopOf(from)?.probe ?? "pathfinder";
  return (probes.find((p) => p.id === pid)?.name ?? "OSC-1").split(" ")[0];
};
const fromNameOf = (id) => {
  const f = stopOf(id)?.from;
  return Array.isArray(f) ? f.map(nameOf).join(" or ") : nameOf(f ?? "earth");
};
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const DRAFT_NOTE = `<p class="page__note">DRAFT · waiting for approval. This page isn't indexed yet.</p>`;
/** Each leg's postcard stamp (only Mars has one so far; the stamp icons come from PixelLab). */
const STAMP = { mars: "/sprites/mars-32.png" };
const gb = new Intl.NumberFormat("en-GB");
const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

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

/** The share row on pages people share (phase S1): plain links, filled in by a small script with this page's
 * own address, so they're right on workers.dev now and on onesmallclick.io later. Keep the links in step with
 * shared/share.ts channelHref(). Hidden until the script runs. */
function shareRow(text) {
  const apps = [
    ["wa", "WhatsApp"],
    ["x", "X"],
    ["fb", "Facebook"],
    ["rd", "Reddit"],
    ["tg", "Telegram"],
  ];
  return `      <section class="page-share" aria-labelledby="share-label" data-text="${esc(text)}" hidden>
        <h2 id="share-label" class="page__label">SHARE THIS PAGE</h2>
        <button type="button" class="pbtn pbtn--blue pbtn--block page-share__sheet" data-share="sheet" hidden>Share…</button>
        <div class="page-share__apps">
${apps.map(([v, label]) => `          <a class="pbtn pbtn--outline" data-share="${v}" target="_blank" rel="noopener noreferrer">${label}</a>`).join("\n")}
          <button type="button" class="pbtn pbtn--outline" data-share="copy">Copy link</button>
        </div>
        <p class="page-share__note" aria-live="polite"></p>
      </section>
      <script>
        (function () {
          var box = document.querySelector(".page-share");
          var url = location.origin + location.pathname;
          var text = box.getAttribute("data-text");
          var e = encodeURIComponent;
          var links = {
            wa: "https://wa.me/?text=" + e(text + " " + url),
            x: "https://x.com/intent/post?text=" + e(text) + "&url=" + e(url),
            fb: "https://www.facebook.com/sharer/sharer.php?u=" + e(url),
            rd: "https://www.reddit.com/submit?url=" + e(url) + "&title=" + e(text.slice(0, 280)),
            tg: "https://t.me/share/url?url=" + e(url) + "&text=" + e(text)
          };
          var count = function (v) {
            try {
              fetch("/api/share", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ m: "page", v: v }) }).catch(function () {});
            } catch (x) {}
          };
          var note = box.querySelector(".page-share__note");
          box.querySelectorAll("[data-share]").forEach(function (el) {
            var v = el.getAttribute("data-share");
            if (links[v]) el.href = links[v];
            el.addEventListener("click", function () {
              count(v);
              if (v === "copy") {
                navigator.clipboard.writeText(url).then(
                  function () { note.textContent = "Link copied. Paste it anywhere."; },
                  function () { note.textContent = "Couldn't copy. The link is " + url; }
                );
              } else if (v === "sheet") {
                navigator.share({ title: document.title, text: text, url: url }).catch(function () {});
              }
            });
          });
          if (navigator.share && matchMedia("(pointer: coarse)").matches) box.querySelector(".page-share__sheet").hidden = false;
          box.hidden = false;
        })();
      </script>`;
}

function page({ path, title, description, body, current, image = "default", share = null, noindex = false }) {
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
    <meta name="description" content="${esc(description)}" />${noindex ? '\n    <meta name="robots" content="noindex" />' : ""}
    <meta name="theme-color" content="#0e1a40" />
    <!-- Link previews (phase S1). The Worker makes these links absolute for the pages people share (worker/share.ts). -->
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="OneSmallClick" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(path)}" />
    <meta property="og:image" content="/share/${esc(image)}.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="OneSmallClick, a pixel-art space game" />
    <meta name="twitter:card" content="summary_large_image" />
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
${share ? shareRow(share) : ""}
      </main>
      <aside class="ad-slot" aria-label="Advertisement">
        <div class="ad-slot__label" aria-hidden="true">ADVERTISEMENT</div>
        <div class="ad-slot__box">AD SLOT · 320×100</div>
      </aside>
      <footer class="page__foot">
        <a href="/">Play OneSmallClick</a>
        <a href="/how-to-play">How to play</a>
        <a href="/log">Mission log</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/contact">Contact</a>
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

function milestoneList(list = milestones) {
  return `<ol class="milestones">
${list
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

// The early-access note (prompts 82-83, content/beta.json), until launch. The pages are rebuilt on every deploy.
const beta = JSON.parse(read("content/beta.json"));
function betaNote() {
  if (Date.now() >= Date.parse(beta.endsAt)) return "";
  return `      <aside class="window beta-note" aria-labelledby="beta-title">
        <h2 id="beta-title" class="beta-note__title">${esc(beta.title)}</h2>
${beta.body.map((p) => `        <p class="page__note">${esc(p)}</p>`).join("\n")}
        <a class="pbtn pbtn--orange beta-note__cta" href="/sign-in">${esc(beta.signIn)}</a>
      </aside>`;
}

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
${betaNote()}
      <p class="page__note">The big date on the home screen moves with all of us. More play, sooner arrival.</p>
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Start pushing</a>
      <section aria-labelledby="milestones-title">
        <h2 id="milestones-title" class="page__h2">Six milestones on the way</h2>
        <p class="page__note">Each one unlocks a postcard and a fact from the flight deck.</p>
        ${milestoneList()}
      </section>`,
});

// ---------- One fact page per milestone ----------

function factPage(leg, m, i) {
  const list = leg.milestones;
  const prev = list[i - 1];
  const next = list[i + 1];
  const card = String(m.n).padStart(2, "0");
  const dest = nameOf(leg.stop);
  const from = fromNameOf(leg.stop);
  const stamp = STAMP[leg.stop];
  const count = COUNT_WORDS[list.length] ?? String(list.length);
  return page({
    path: `/milestones/${m.slug}`,
    image: existsSync(join(root, "public", "share", `milestone-${m.slug}.png`)) ? `milestone-${m.slug}` : "default",
    share: `${/[.!?]$/.test(m.title) ? m.title : `${m.title}.`} The crew flying one probe to ${dest} got this far. Help push it on:`,
    title: `${m.name}: milestone ${m.n} of ${list.length} · OneSmallClick`,
    description: m.description,
    noindex: !leg.approved,
    body: `      <div>${leg.approved ? "" : `\n        ${DRAFT_NOTE}`}
        <p class="page__label page__label--orange">${leg.stop === "mars" ? "" : `${esc(from.toUpperCase())} → ${esc(dest.toUpperCase())} · `}MILESTONE ${m.n} OF ${list.length} · ${gb.format(m.km)} KM FROM ${esc(from.toUpperCase())}</p>
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
          ${stamp ? `<div class="postcard__stamp" aria-hidden="true"><img src="${stamp}" alt="" width="32" height="32" /></div>` : ""}
        </div>
        <figcaption class="postcard__caption"><span>Wish you were here. — ${probeTagOf(leg.stop)}</span><span class="postcard__no num">POSTCARD ${card}</span></figcaption>
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
        <h2 id="milestones-title" class="page__h2">All ${count} milestones${leg.stop === "mars" ? "" : ` to ${esc(dest)}`}</h2>
        ${milestoneList(list)}
      </section>`,
  });
}

// ---------- One page per destination's facts (E4b part 1, prompts 49–50) ----------

/** The 32px icon each destination has (the Destination file card uses the same). */
const DEST_ICON = { mars: "/sprites/mars-32.png" };

function destinationPage(d) {
  const name = nameOf(d.destination);
  const total = d.facts.length;
  const iconSrc = DEST_ICON[d.destination];
  return page({
    path: `/destinations/${d.destination}`,
    image: existsSync(join(root, "public", "share", `destination-${d.destination}.png`)) ? `destination-${d.destination}` : "default",
    share: `${total} facts about ${name}, from the crew flying one probe there:`,
    title: `${total} facts about ${name} · Destination file · OneSmallClick`,
    description: `${total} fun facts about ${name}, each checked against NASA, from OneSmallClick's Destination file: one a day while the crew flies there.`,
    noindex: !d.approved,
    body: `      <div>${d.approved ? "" : `\n        ${DRAFT_NOTE}`}
        <p class="page__label page__label--orange dest-page__label">${iconSrc ? `<img src="${iconSrc}" alt="" width="32" height="32" />` : ""}DESTINATION FILE · ${esc(name.toUpperCase())}</p>
        <h1 id="page-title" class="page__title">${total} facts about ${esc(name)}</h1>
      </div>
      <p class="page__note">While the crew flies ${probeTagOf(d.destination)} to ${esc(name)}, the game home shows one of these each day, with a new one at 00:00 UTC. Every fact was checked against the NASA page linked under it on ${longDate.format(new Date(d.checked))}.</p>
      <ol class="dest-facts">
${d.facts
  .map(
    (f) => `        <li id="fact-${f.n}" class="window dest-fact">
          <p class="dest-fact__n num">Fact ${f.n} of ${total}</p>
          <p class="dest-fact__text">${esc(f.fact)}</p>
          <p class="dest-fact__source">Source: <a href="${esc(f.source.url)}" rel="noopener">${esc(f.source.label)}</a>, which says: “${esc(f.quote)}”</p>
        </li>`,
  )
  .join("\n")}
      </ol>
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Help push the probe</a>`,
  });
}

// ---------- Who runs the site (phase 9a, prompt 54) ----------

// The contact address moves to an @onesmallclick.io one after payday (docs/todo.md, "Payday").
const OPERATOR = { name: "websitesbynavee.co.uk", url: "https://websitesbynavee.co.uk" };
const CONTACT_EMAIL = "naveessharma@gmail.com";
const mailto = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;
const operatorLink = `<a href="${OPERATOR.url}" rel="noopener">${OPERATOR.name}</a>`;
const LEGAL_UPDATED = "20 November 2026";
// The privacy page alone changed in phase S1 (crew links and share counts).
const PRIVACY_UPDATED = "25 November 2026";

/** A page of titled sections in windows (privacy, terms): paragraphs are trusted HTML. */
function sectionsHtml(id, sections) {
  return sections
    .map(
      ([title, paras], i) => `      <section class="window prose" aria-labelledby="${id}-${i}">
        <h2 id="${id}-${i}" class="page__h2">${esc(title)}</h2>
${paras.map((p) => `        <p>${p}</p>`).join("\n")}
      </section>`,
    )
    .join("\n");
}

// ---------- Terms (phase 9a) ----------

const termsSections = [
  [
    "Who runs OneSmallClick",
    [
      `OneSmallClick is a free browser game run by ${operatorLink}. Questions, problems or anything else: ${mailto}, or see the <a href="/contact">contact page</a>.`,
      "By playing you agree to these terms. They're written to be read, not to trip anyone up.",
    ],
  ],
  [
    "The game",
    [
      "Everyone pushes the same probe. The mission, its route, the votes and the numbers behind them can change as we balance the game, and a mission can be reset or paused (for example once, at launch, when the test mission restarts and everyone keeps their progress).",
      "Credits, upgrades, badges, medals and names are part of the game only. They have no money value and can't be sold or swapped for anything.",
      "There's nothing to buy. We may show ads in marked slots on some pages; the <a href=\"/privacy\">privacy page</a> says what that means for your data.",
    ],
  ],
  [
    "Playing fair",
    [
      "Push with your own taps. Don't use bots, scripts or auto-clickers, and don't use extra devices or accounts to get extra pings or votes.",
      "To keep this fair the game limits taps per second, checks pings and votes for bots, and caps pings and votes from one network each day. If someone cheats anyway, we may remove the progress it earned or block the device or account.",
      "Don't attack, overload or try to break into the game or the people who play it.",
    ],
  ],
  [
    "Your account",
    [
      "Signing in is optional. Crew names are generated, so nobody can pick an offensive one. Keep your sign-in to yourself.",
      "You can delete your account at any time from the sign-in page. The km you pushed stay in the mission, without your name.",
    ],
  ],
  [
    "Age",
    [
      "Anyone can play as a guest. If you're under 13, ask a parent or guardian before you sign in. (Google accounts need you to be 13 or older in most countries anyway.)",
    ],
  ],
  [
    "Facts and content",
    [
      "Every fact in the game links to the source we checked it against. If you spot a mistake, please tell us and we'll fix it.",
      "The game's art, text and code belong to OneSmallClick, apart from the parts other people made and licensed: the fonts (Pixelify Sans and VT323, SIL Open Font License) and the pixel flags (from flag-icons, MIT licence).",
    ],
  ],
  [
    "No guarantees",
    [
      "We run OneSmallClick as well as we can, but it's provided as it is: it may be down, slow or wrong at times, and progress can be lost if something breaks.",
      "As far as the law allows, we aren't responsible for losses from using it, or from not being able to. Nothing here takes away rights you have under UK consumer law.",
    ],
  ],
  [
    "Changes",
    [
      `If these terms change, this page changes too, with a new date. Last updated ${LEGAL_UPDATED}. These terms are under the law of England and Wales.`,
    ],
  ],
];

const terms = page({
  path: "/terms",
  current: "/terms",
  title: "Terms · OneSmallClick",
  description: "The terms for playing OneSmallClick: who runs it, playing fair, accounts, age, and what we can and can't promise.",
  body: `      <div>
        <p class="page__label">TERMS</p>
        <h1 id="page-title" class="page__title">Playing OneSmallClick</h1>
      </div>
      <p class="page__note">The short version: it's free, play fair, under-13s ask a parent before signing in, and things can change as we balance the game. Updated ${LEGAL_UPDATED}.</p>
${sectionsHtml("terms", termsSections)}
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Back to the mission</a>`,
});

// ---------- Contact (phase 9a) ----------

const contact = page({
  path: "/contact",
  current: "/contact",
  title: "Contact · OneSmallClick",
  description: "How to get in touch about OneSmallClick: bugs, a fact that looks wrong, your data, or anything else.",
  body: `      <div>
        <p class="page__label">CONTACT</p>
        <h1 id="page-title" class="page__title">Mission control</h1>
      </div>
      <section class="window prose" aria-labelledby="contact-0">
        <h2 id="contact-0" class="page__h2">Email</h2>
        <p>${mailto}</p>
        <p>OneSmallClick is run by ${operatorLink}. One person reads every message, so replies can take a few days.</p>
      </section>
      <section class="window prose" aria-labelledby="contact-1">
        <h2 id="contact-1" class="page__h2">Good things to write about</h2>
        <p>A bug: what you did, what happened, and your phone or browser.</p>
        <p>A fact that looks wrong: which one, and a source if you have it. Every fact links to the page we checked it against.</p>
        <p>Your data: a copy of it, or a question about it. To delete your account straight away, use the <a href="/sign-in">sign-in page</a>. More on the <a href="/privacy">privacy page</a>.</p>
        <p>Cheating you've spotted, ideas for the route, or anything else.</p>
      </section>
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Back to the mission</a>`,
});

// ---------- Privacy (phase 8a: sign-in starts storing email addresses) ----------

const privacySections = [
  [
    "Who runs OneSmallClick",
    [
      `OneSmallClick is run by ${operatorLink}, which decides what's collected and why (the “data controller”). For anything about your data, email ${mailto}.`,
    ],
  ],
  [
    "Playing as a guest",
    [
      "The first time you open the game, your browser gets a random device id in a cookie (osc_device). It's signed so nobody can fake it, and it holds nothing about you. It lasts up to 400 days.",
      "With it we keep your generated name (like orbit_otter), the country Cloudflare's network says you're visiting from (the country only, worked out once when the id is made), when you first and last played, and your game: the km and THRUST clicks you push each day, your pings and votes, your credits, upgrades and patches, the badges you earn, and the legs you helped on (your passport stamps). For the Night Shift badge, the game checks the time zone Cloudflare’s network gives for your connection while you tap; it isn’t stored.",
      "When you Ping or vote, the game counts how many pings and votes came from your network that day, so one person can't cast dozens from lots of devices (the limit is 50 of each). Your network address isn't stored: it's mixed with a secret and the date, and only that scrambled result is kept, for two days.",
      "Your browser also keeps a few things for itself: your light or dark theme, a copy of the probe's position so the page opens fast, and which milestone moments you've already seen.",
    ],
  ],
  [
    "Signing in",
    [
      "Signing in is optional. If you sign in with an email link, we keep your email address. If you sign in with Google, we keep your email address and Google's id for your account, and nothing else from Google: no name, no photo, no contacts.",
      "Your account also has its generated crew name and a country (detected when the account is made; you can change it once). A sign-in cookie (osc_session) keeps you signed in for up to 90 days; a short cookie (osc_oauth) lasts 10 minutes while you're away at Google.",
      "A sign-in link is stored only as a scrambled code (a hash), and it stops working after one use or 15 minutes.",
      "Anyone can play as a guest. If you're under 13, ask a parent or guardian before you sign in.",
    ],
  ],
  [
    "Sharing",
    [
      "The first time you share, you get a crew link (like /c/k7p2qx). Its code is random: it isn't your name or your email. Anyone who opens it sees your crew name, and the link preview shows the km you've pushed.",
      "We count shares and crew-link visits per day, by what was shared and where (WhatsApp, X and so on), as plain totals with nothing about who shared or who visited.",
      "When someone new starts playing through your crew link, we note that their device came through your link, so we can count your recruits. You see how many recruits you have and the km they've pushed, never who they are.",
      "The share buttons are plain links: no WhatsApp, X, Facebook, Reddit or Telegram scripts run on our pages. Those apps only see what you choose to send.",
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
      "The database is backed up by Cloudflare, and as encrypted copies in our private Google Drive, in case something goes wrong with either. The copies are locked with a key only we hold, so Google can't read them, and each is deleted after 90 days.",
      "There are no ads, no analytics trackers and no Google scripts on our pages. We never sell your data and never post anything for you.",
    ],
  ],
  [
    "Your choices",
    [
      "Sign out at any time: your progress stays with your account, and the device carries on as a new guest.",
      "Delete your account from the sign-in page: your email, name, account progress and passport stamps are deleted straight away, and your name comes off the mission credits. Backups roll off on their own: Cloudflare's within 30 days, and our encrypted copies within 90 days. The km you pushed stay in the mission without your name.",
      `For a copy of your data, or anything else about privacy, email ${mailto}.`,
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
${sectionsHtml("privacy", privacySections)}
      <a class="pbtn pbtn--blue pbtn--lg page__cta" href="/">Back to the mission</a>`,
});

// ---------- Write ----------

rmSync(join(root, "public", "milestones"), { recursive: true, force: true });
rmSync(join(root, "public", "destinations"), { recursive: true, force: true });
out("content.css", css);
out("how-to-play.html", howToPlay);
out("privacy.html", privacy);
out("terms.html", terms);
out("contact.html", contact);
legs.forEach((leg) => leg.milestones.forEach((m, i) => out(`milestones/${m.slug}.html`, factPage(leg, m, i))));
destinations.forEach((d) => out(`destinations/${d.destination}.html`, destinationPage(d)));
const pageCount = legs.reduce((n, l) => n + l.milestones.length, 0);
console.log(
  `build-pages: how-to-play, privacy, terms, contact + ${pageCount} milestone pages (${legs.length} legs) + ${destinations.length} destination pages, content.css ${cssVersion}`,
);
