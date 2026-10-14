/**
 * Check recaps.json before it is pushed. Read-only; needs no network.
 *
 *   node check-recaps.mjs                  # exit 0 = fine, 1 = something to fix
 *   node check-recaps.mjs --was old.json   # also fail if any article in old.json is gone
 *
 * Every article needs a unique slug and a teaser: plain text, at most 600
 * characters, no HTML, whose last line is exactly the article's own link.
 */
import { readFile } from "fs/promises";

export const SITE = "https://drewkim623-hash.github.io/ccubed/";
export const TEASER_MAX = 600;
export const teaserLink = slug => `${SITE}#news/${slug}`;

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

export function recapsProblems(j, was) {
  const out = [];
  const arts = (j && j.articles) || [];
  const slugs = new Set();
  for (const a of arts) {
    if (!a.slug || !/^[a-z0-9][a-z0-9-]*$/.test(a.slug)) out.push(`bad slug: ${JSON.stringify(a.slug)}`);
    if (slugs.has(a.slug)) out.push(`duplicate slug: ${a.slug}`);
    slugs.add(a.slug);
  }
  for (const a of arts) for (const p of teaserProblems(a, slugs)) out.push(`${a.slug}: ${p}`);
  for (const a of (was && was.articles) || [])
    if (!slugs.has(a.slug)) out.push(`article ${a.slug} was in the old file and is gone`);
  if (!Array.isArray(j && j.weeks)) out.push("weeks[] is missing");
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const j = JSON.parse(await readFile("recaps.json", "utf8"));
  const i = process.argv.indexOf("--was");
  const was = i > 0 ? JSON.parse(await readFile(process.argv[i + 1], "utf8")) : null;
  const probs = recapsProblems(j, was);
  for (const p of probs) console.log(`FAIL  ${p}`);
  console.log(probs.length ? `\n${probs.length} problem(s). Fix them before pushing.`
    : `ok  ${j.articles.length} articles, every teaser in shape`);
  process.exit(probs.length ? 1 : 0);
}
