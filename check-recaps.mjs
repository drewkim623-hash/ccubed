/**
 * Check recaps.json before it is pushed. Read-only; needs no network.
 *
 *   node check-recaps.mjs                  # exit 0 = fine, 1 = something to fix
 *   node check-recaps.mjs --was old.json   # also fail if any article in old.json is gone
 *
 * Every article needs a unique slug and a teaser in the breaking-news shape
 * (TEASER_SHAPE): plain text, at most 600 characters, no HTML, three stat lines
 * whose numbers all appear in the article, and its own card link last. Run
 * from the repo root it also checks each article's link card (news/<slug>.html
 * and img/og/<slug>.png, written by build-cards.mjs).
 * Every weeks[] entry needs the full recap shape (lede, six games, 3-6 notebook
 * items) at the length the contract asks for, and scores that match the
 * committed week file.
 */
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export const SITE = "https://drewkim623-hash.github.io/ccubed/";
export const TEASER_MAX = 600;
/** The card page a teaser links to; it carries the og: tags and opens #news/<slug>. */
export const cardUrl = slug => `${SITE}news/${slug}.html`;
export const ogImageUrl = slug => `${SITE}img/og/${slug}.png`;
export const teaserLink = cardUrl;
export const TEASER_SHAPE = `🚨 C CUBED | WEEK n      (or PRESEASON before week 1)

HEADLINE IN CAPS

<emoji> stat line 1
<emoji> stat line 2
<emoji> stat line 3

Full story 👇
${SITE}news/<slug>.html`;
/* Word counts are measured on the reference league's 2026 pieces, rounded out:
 * its weeks[] entries ran 613-942 words (average 745), its "tuesday" articles
 * 884-1,457 (average 1,120). */
export const WEEK_WORDS = { min: 600, max: 950 };
export const TUESDAY_WORDS = { min: 850, max: 1500 };
export const AROUND_KINDS = ["trade", "waivers", "riser", "slider", "streak", "injury", "race", "note"];

const words = s => String(s || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
/** Words a reader reads in a weeks[] entry: the lede, every game and every notebook item. */
export const weekWords = w => words(w.lede)
  + (w.games || []).reduce((n, g) => n + words(g.headline) + words(g.body), 0)
  + (w.around || []).reduce((n, a) => n + words(a.headline) + words(a.body), 0);
/** Words a reader reads in an article's blocks; ids, links and alt text do not count. */
export function articleWords(a) {
  const skip = new Set(["type", "eyebrow", "src", "href", "alt", "width", "height", "group", "lead", "narrow"]);
  const walk = o => typeof o === "string" ? words(o) : Array.isArray(o) ? o.reduce((n, x) => n + walk(x), 0)
    : o && typeof o === "object" ? Object.entries(o).reduce((n, [k, v]) => n + (skip.has(k) ? 0 : walk(v)), 0) : 0;
  return walk(a.blocks || []);
}

const plainText = o => typeof o === "string" ? o.replace(/<[^>]+>/g, " ")
  : Array.isArray(o) ? o.map(plainText).join(" ") : o && typeof o === "object" ? Object.values(o).map(plainText).join(" ") : "";
const NUM = /\d[\d,]*(?:\.\d+)?/g;
const STAT_LINE = /^\p{Extended_Pictographic}️?\s+\S/u;

/** Every problem with one article's teaser, as sentences; empty when it is fine. */
export function teaserProblems(a, slugs) {
  const out = [], t = a && a.teaser;
  if (typeof t !== "string" || !t.trim()) return ["has no teaser"];
  if (t.length > TEASER_MAX) out.push(`teaser is ${t.length} characters (limit ${TEASER_MAX})`);
  if (/<\/?[a-z][^>]*>|&[a-z#0-9]+;/i.test(t)) out.push("teaser contains HTML");
  const L = t.split("\n");
  if (L.length !== 10) return [...out, `teaser has ${L.length} lines; the shape is these 10:\n${TEASER_SHAPE}`];
  const head = /^🚨 C CUBED \| (?:WEEK (\d{1,2})|PRESEASON)$/.exec(L[0]);
  if (!head) out.push(`teaser's first line is not "🚨 C CUBED | WEEK n" (or PRESEASON): ${JSON.stringify(L[0])}`);
  const body = plainText([a.headline, a.dek, a.blocks]);
  if (head && head[1] && !new RegExp(`\\bweek ${Number(head[1])}\\b`, "i").test(body))
    out.push(`teaser says WEEK ${head[1]}, which the article never mentions`);
  if (!L[2].trim() || L[2] !== plainText(a.headline || "").toUpperCase())
    out.push("teaser's third line is not the headline in capitals");
  for (const i of [1, 3, 7]) if (L[i] !== "") out.push(`teaser line ${i + 1} must be blank`);
  // Every number on a stat line has to be one the article itself prints.
  const nums = new Set((body.match(NUM) || []).map(n => n.replace(/,/g, "")));
  for (const i of [4, 5, 6]) {
    if (!STAT_LINE.test(L[i])) out.push(`teaser line ${i + 1} is not an emoji and a stat`);
    const own = (L[i].match(NUM) || []).map(n => n.replace(/,/g, ""));
    if (!own.length) out.push(`teaser line ${i + 1} carries no number`);
    for (const n of own) if (!nums.has(n)) out.push(`teaser line ${i + 1} says ${n}, which is not in the article`);
  }
  if (L[8] !== "Full story 👇") out.push(`teaser line 9 is not "Full story 👇"`);
  const m = /\/news\/([^\s#?/]+)\.html$/.exec(L[9]);
  if (L[9] !== teaserLink(a.slug)) out.push(`teaser's last line is not ${teaserLink(a.slug)}`);
  if (m && slugs && !slugs.has(m[1])) out.push(`teaser links to ${m[1]}, which is not an article`);
  return out;
}

/** Width and height of a PNG, off its IHDR chunk; null when it is not a PNG. */
export function pngSize(buf) {
  if (!buf || buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString("latin1", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** The og:/twitter: tags and the canonical link in a card page, by name. */
export function metaTags(html) {
  const out = {};
  for (const m of String(html).matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g)) out[m[1]] = m[2];
  const c = /<link rel="canonical" href="([^"]+)"/.exec(html);
  if (c) out.canonical = c[1];
  return out;
}

/** Every problem with one card page; `a` is the article it opens. */
export function cardTagProblems(html, a) {
  const out = [], t = metaTags(html);
  const want = { "og:title": true, "og:description": true, "og:image": ogImageUrl(a.slug), "og:url": cardUrl(a.slug),
    "twitter:card": "summary_large_image", "twitter:image": ogImageUrl(a.slug), canonical: cardUrl(a.slug) };
  for (const [k, v] of Object.entries(want)) {
    if (!t[k]) out.push(`has no ${k}`);
    else if (v !== true && t[k] !== v) out.push(`${k} is ${t[k]}, not ${v}`);
  }
  if (!html.includes(`url=../#news/${a.slug}"`) || !html.includes(`location.replace("../#news/${a.slug}")`))
    out.push(`does not send the reader on to ../#news/${a.slug}`);
  return out;
}

/** Every problem with the link cards under `root`: a page per slug and alias, an image per article. */
export async function cardFileProblems(j, root = ".") {
  const out = [];
  for (const a of (j && j.articles) || []) {
    for (const s of [a.slug, ...(a.aliases || [])]) {
      const f = `${root}/news/${s}.html`;
      if (!existsSync(f)) { out.push(`${s}: news/${s}.html is missing (run node build-cards.mjs)`); continue; }
      for (const p of cardTagProblems(await readFile(f, "utf8"), a)) out.push(`${s}: news/${s}.html ${p}`);
    }
    const img = `${root}/img/og/${a.slug}.png`;
    if (!existsSync(img)) { out.push(`${a.slug}: img/og/${a.slug}.png is missing (run node build-cards.mjs)`); continue; }
    const sz = pngSize(await readFile(img));
    if (!sz || sz.width !== 1200 || sz.height !== 630)
      out.push(`${a.slug}: img/og/${a.slug}.png is ${sz ? `${sz.width}x${sz.height}` : "not a PNG"}, not 1200x630`);
  }
  if (!existsSync(`${root}/.nojekyll`)) out.push(".nojekyll is missing, so Pages may not serve news/ as is");
  return out;
}

/** Every problem with one weeks[] entry; `file` is the committed week file, when there is one. */
export function weekProblems(w, file) {
  const out = [], id = `week ${w && w.season}/${w && w.week}`;
  if (!w || typeof w !== "object") return ["a weeks[] entry is not an object"];
  if (!/^\d{4}$/.test(String(w.season)) || typeof w.season !== "string") out.push(`${id}: season must be a 4-digit string`);
  if (!Number.isInteger(w.week) || w.week < 1 || w.week > 17) out.push(`${id}: week must be an integer 1-17`);
  if (typeof w.note !== "string") out.push(`${id}: note must be a string ("" outside the playoffs)`);
  if (typeof w.lede !== "string" || !w.lede.trim()) out.push(`${id}: has no lede`);
  const games = Array.isArray(w.games) ? w.games : [];
  if (games.length !== 6) out.push(`${id}: needs all six games, has ${games.length}`);
  games.forEach((g, i) => {
    for (const k of ["headline", "winner", "loser", "body"])
      if (typeof g[k] !== "string" || !g[k].trim()) out.push(`${id}: game ${i + 1} has no ${k}`);
    if (typeof g.winner_points !== "number" || typeof g.loser_points !== "number")
      out.push(`${id}: game ${i + 1} points must be numbers`);
    else if (g.winner_points < g.loser_points) out.push(`${id}: game ${i + 1} winner scored less than the loser`);
  });
  const around = Array.isArray(w.around) ? w.around : [];
  if (around.length < 3 || around.length > 6) out.push(`${id}: needs 3-6 around items, has ${around.length}`);
  around.forEach((a, i) => {
    if (!AROUND_KINDS.includes(a.kind)) out.push(`${id}: around ${i + 1} has kind ${JSON.stringify(a.kind)}`);
    if (typeof a.headline !== "string" || !a.headline.trim() || typeof a.body !== "string" || !a.body.trim())
      out.push(`${id}: around ${i + 1} needs a headline and a body`);
  });
  const n = weekWords(w);
  if (n < WEEK_WORDS.min || n > WEEK_WORDS.max)
    out.push(`${id}: is ${n} words; a full recap runs ${WEEK_WORDS.min}-${WEEK_WORDS.max}`);
  if (file && Array.isArray(file.games)) {
    const key = (a, ap, b, bp) => `${a} ${Number(ap).toFixed(2)} ${b} ${Number(bp).toFixed(2)}`;
    const want = new Set(file.games.map(g => key(g.winner, g.winner_points, g.loser, g.loser_points)));
    for (const g of games) if (!want.has(key(g.winner, g.winner_points, g.loser, g.loser_points)))
      out.push(`${id}: ${g.winner} ${g.winner_points} - ${g.loser} ${g.loser_points} is not a result in the week file`);
  }
  return out;
}

export function recapsProblems(j, was, weekFiles = {}) {
  const out = [];
  const arts = (j && j.articles) || [];
  const slugs = new Set();
  for (const a of arts) {
    if (!a.slug || !/^[a-z0-9][a-z0-9-]*$/.test(a.slug)) out.push(`bad slug: ${JSON.stringify(a.slug)}`);
    if (slugs.has(a.slug)) out.push(`duplicate slug: ${a.slug}`);
    slugs.add(a.slug);
  }
  // An alias keeps an old link alive; it must not shadow a live slug or another alias.
  const aliases = new Set();
  for (const a of arts) for (const s of a.aliases || []) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(s))) out.push(`${a.slug}: bad alias ${JSON.stringify(s)}`);
    else if (slugs.has(s) || aliases.has(s)) out.push(`${a.slug}: alias ${s} is already taken`);
    aliases.add(s);
  }
  for (const a of arts) for (const p of teaserProblems(a, slugs)) out.push(`${a.slug}: ${p}`);
  for (const a of arts) if (a.source === "tuesday") {
    const n = articleWords(a);
    if (n < TUESDAY_WORDS.min || n > TUESDAY_WORDS.max)
      out.push(`${a.slug}: the Tuesday article is ${n} words; it runs ${TUESDAY_WORDS.min}-${TUESDAY_WORDS.max}`);
  }
  // A tiers block names its teams by manager handle; every one must be a manager in the week files.
  const handles = new Set(Object.values(weekFiles).flatMap(w => (w.standings || []).map(s => String(s.manager).toLowerCase())));
  for (const a of arts) for (const b of a.blocks || []) if (b && b.type === "tiers") {
    const rows = (b.tiers || []).flatMap(t => (t && t.rows) || []);
    if (!rows.length) out.push(`${a.slug}: a tiers block has no rows`);
    for (const r of rows) {
      if (typeof r.pct !== "number" || !(r.pct >= 0 && r.pct <= 100)) out.push(`${a.slug}: tiers row ${r.team} has pct ${JSON.stringify(r.pct)}, not 0-100`);
      if (handles.size && !handles.has(String(r.team).toLowerCase())) out.push(`${a.slug}: tiers team ${JSON.stringify(r.team)} is not a manager`);
    }
    if (b.cutAfter && !rows.some(r => r.team === b.cutAfter)) out.push(`${a.slug}: tiers cutAfter ${b.cutAfter} is not one of its rows`);
  }
  for (const a of (was && was.articles) || [])
    if (!slugs.has(a.slug) && !aliases.has(a.slug)) out.push(`article ${a.slug} was in the old file and is gone`);
  if (!Array.isArray(j && j.weeks)) out.push("weeks[] is missing");
  const seen = new Set();
  for (const w of (j && j.weeks) || []) {
    const k = `${w && w.season}/${w && w.week}`;
    if (seen.has(k)) out.push(`week ${k} appears twice in weeks[]`);
    seen.add(k);
    out.push(...weekProblems(w, weekFiles[k]));
  }
  return out;
}

/** The committed week files for every week recaps.json writes up, keyed "season/week". */
export async function loadWeekFiles(j, root = ".") {
  const out = {};
  for (const w of (j && j.weeks) || []) {
    const f = `${root}/data/week-${w.season}-${String(w.week).padStart(2, "0")}.json`;
    if (existsSync(f)) out[`${w.season}/${w.week}`] = JSON.parse(await readFile(f, "utf8"));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const j = JSON.parse(await readFile("recaps.json", "utf8"));
  const i = process.argv.indexOf("--was");
  const was = i > 0 ? JSON.parse(await readFile(process.argv[i + 1], "utf8")) : null;
  const probs = [...recapsProblems(j, was, await loadWeekFiles(j)), ...await cardFileProblems(j)];
  for (const p of probs) console.log(`FAIL  ${p}`);
  console.log(probs.length ? `\n${probs.length} problem(s). Fix them before pushing.`
    : `ok  ${j.articles.length} articles, every teaser in shape, every link card built; ${j.weeks.length} week(s) in full recap shape`);
  process.exit(probs.length ? 1 : 0);
}
