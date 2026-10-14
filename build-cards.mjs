/**
 * Link cards for every article, so a pasted link unfurls with a picture.
 *
 *   node build-cards.mjs        # reads recaps.json, writes news/*.html and img/og/*.png
 *
 * For each article it writes news/<slug>.html, a static page carrying the
 * og: and twitter: tags (all absolute URLs) that sends a browser on to
 * ../#news/<slug>, and img/og/<slug>.png, a 1200x630 card drawn in Playwright
 * from the template below. An old slug kept in `aliases` gets a page too,
 * pointing at the article it became. Free and local; files are only rewritten
 * when their bytes change, so a second run changes nothing.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { SITE, cardUrl, ogImageUrl } from "./check-recaps.mjs";

const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = s => String(s ?? "").replace(/<[^>]+>/g, "");

/** The card page for `slug`, which opens article `a` (its own slug, or one of its aliases). */
export function cardPage(a, slug = a.slug) {
  const to = `../#news/${a.slug}`;
  const title = plain(a.headline), desc = plain(a.dek || a.standfirst || "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · C Cubed</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${cardUrl(a.slug)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="C Cubed">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${cardUrl(a.slug)}">
<meta property="og:image" content="${ogImageUrl(a.slug)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogImageUrl(a.slug)}">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)});</script>
</head>
<body style="font-family:system-ui,sans-serif;background:#0b0b0f;color:#eee;padding:24px">
<p><a href="${to}" style="color:#3987e5">${esc(title)}</a> · C Cubed</p>
</body>
</html>
`;
}

/** "WEEK 5" or "PRESEASON", off the teaser's first line. */
export function weekLabel(a) {
  const m = /^🚨 C CUBED \| (WEEK \d{1,2}|PRESEASON)$/.exec(String(a.teaser || "").split("\n")[0]);
  return m ? m[1] : "C CUBED";
}

/** The card's big number: the article's first stat block, split into figure and unit. */
export function keyStat(a) {
  const s = (a.blocks || []).find(b => b.type === "stat");
  if (!s) return null;
  const m = /^([-+]?[\d.,]+)\s*(.*)$/.exec(String(s.n).trim());
  return { num: m ? m[1] : String(s.n), unit: (m ? m[2] : "").toUpperCase(), label: plain(s.text).split(/(?<=\.)\s/)[0] };
}

function template(a, fontUrl) {
  const st = keyStat(a);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Oswald;src:url(${fontUrl}) format("truetype");font-weight:200 700}
  *{box-sizing:border-box}html,body{margin:0}
  .c{position:relative;width:1200px;height:630px;overflow:hidden;color:#fff;font-family:Oswald,sans-serif;padding:52px 64px 0 82px;
    background:radial-gradient(circle at 85% 18%,#e4002b40,transparent 55%),linear-gradient(135deg,#0a0f1e,#000)}
  .stripe{position:absolute;left:0;top:0;bottom:0;width:18px;background:#e4002b}
  .top{display:flex;justify-content:space-between;align-items:center}
  .brand{font-weight:700;font-size:54px;letter-spacing:5px;line-height:1}
  .tag{font-weight:700;font-size:28px;letter-spacing:4px;background:#e4002b;padding:6px 16px;line-height:1.2}
  .wk{font-weight:700;font-size:34px;letter-spacing:8px;color:#e4002b;margin-top:34px;line-height:1}
  .hl{font-weight:700;font-size:92px;line-height:.98;margin-top:12px;text-transform:uppercase;max-height:236px;max-width:1040px}
  .stat{position:absolute;left:82px;bottom:34px;display:flex;align-items:baseline;gap:16px;max-width:1060px}
  .stat b{font-size:132px;line-height:1;font-weight:700}
  .stat span{font-weight:700;font-size:52px;color:#e4002b;line-height:1}
  .stat i{font-style:normal;font-weight:400;font-size:24px;line-height:1.25;color:#a9adbb;max-width:520px;margin-left:12px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;align-self:center}
  </style></head><body><div class="c" id="card"><div class="stripe"></div>
  <div class="top"><span class="brand">C CUBED</span><span class="tag">BREAKING</span></div>
  <div class="wk">${esc(weekLabel(a))}</div>
  <div class="hl" id="hl">${esc(plain(a.headline))}</div>
  ${st ? `<div class="stat"><b>${esc(st.num)}</b>${st.unit ? `<span>${esc(st.unit)}</span>` : ""}<i>${esc(st.label)}</i></div>` : ""}
  </div></body></html>`;
}

async function writeIfChanged(path, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (existsSync(path) && Buffer.compare(await readFile(path), buf) === 0) return false;
  await writeFile(path, buf);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { chromium } = await import("playwright");
  const j = JSON.parse(await readFile("recaps.json", "utf8"));
  const arts = j.articles || [];
  await mkdir("news", { recursive: true });
  await mkdir("img/og", { recursive: true });
  if (!existsSync(".nojekyll")) await writeFile(".nojekyll", "");
  const font = `data:font/ttf;base64,${(await readFile(new URL("./fonts/Oswald.ttf", import.meta.url))).toString("base64")}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  let changed = 0;
  for (const a of arts) {
    for (const slug of [a.slug, ...(a.aliases || [])])
      if (await writeIfChanged(`news/${slug}.html`, cardPage(a, slug))) { changed++; console.log(`wrote news/${slug}.html`); }
    await page.setContent(template(a, font), { waitUntil: "load" });
    // Once Oswald is in, shrink the headline until it fits its box, so a long one never runs into the stat.
    await page.evaluate(async () => {
      await document.fonts.ready;
      const h = document.getElementById("hl");
      for (let px = 92; px > 40 && h.scrollHeight > 236; px -= 4) h.style.fontSize = px + "px";
    });
    const png = await page.locator("#card").screenshot({ type: "png" });
    if (await writeIfChanged(`img/og/${a.slug}.png`, png)) { changed++; console.log(`wrote img/og/${a.slug}.png`); }
  }
  await browser.close();
  console.log(`ok  ${arts.length} article(s) carded under ${SITE}news/; ${changed} file(s) changed`);
}
