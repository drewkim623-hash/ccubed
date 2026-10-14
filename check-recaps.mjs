/**
 * Check recaps.json before it is pushed. Read-only; needs no network.
 *
 *   node check-recaps.mjs                  # exit 0 = fine, 1 = something to fix
 *   node check-recaps.mjs --was old.json   # also fail if any article in old.json is gone
 *
 * Every article needs a unique slug and a teaser: plain text, at most 600
 * characters, no HTML, whose last line is exactly the article's own link.
 * Every weeks[] entry needs the full recap shape (lede, six games, 3-6 notebook
 * items) at the length the contract asks for, and scores that match the
 * committed week file.
 */
import { readFile } from "fs/promises";
import { existsSync } from "fs";

export const SITE = "https://drewkim623-hash.github.io/ccubed/";
export const TEASER_MAX = 600;
export const teaserLink = slug => `${SITE}#news/${slug}`;
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
  const skip = new Set(["type", "eyebrow", "src", "href", "alt", "width", "height", "group", "lead"]);
  const walk = o => typeof o === "string" ? words(o) : Array.isArray(o) ? o.reduce((n, x) => n + walk(x), 0)
    : o && typeof o === "object" ? Object.entries(o).reduce((n, [k, v]) => n + (skip.has(k) ? 0 : walk(v)), 0) : 0;
  return walk(a.blocks || []);
}

/** Every problem with one article's teaser, as sentences; empty when it is fine. */
export function teaserProblems(a, slugs) {
  const out = [], t = a && a.teaser;
  if (typeof t !== "string" || !t.trim()) return ["has no teaser"];
  if (t.length > TEASER_MAX) out.push(`teaser is ${t.length} characters (limit ${TEASER_MAX})`);
  if (/<\/?[a-z][^>]*>|&[a-z#0-9]+;/i.test(t)) out.push("teaser contains HTML");
  const lines = t.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) out.push("teaser needs a headline, at least one line, and the link");
  const m = /#news\/([^\s#?]+)$/.exec(lines[lines.length - 1] || "");
  if (lines[lines.length - 1] !== teaserLink(a.slug)) out.push(`teaser's last line is not ${teaserLink(a.slug)}`);
  if (m && slugs && !slugs.has(m[1])) out.push(`teaser links to ${m[1]}, which is not an article`);
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
  const probs = recapsProblems(j, was, await loadWeekFiles(j));
  for (const p of probs) console.log(`FAIL  ${p}`);
  console.log(probs.length ? `\n${probs.length} problem(s). Fix them before pushing.`
    : `ok  ${j.articles.length} articles, every teaser in shape; ${j.weeks.length} week(s) in full recap shape`);
  process.exit(probs.length ? 1 : 0);
}
