/**
 * How each matchup's line moved during a week, kept as a running log.
 *
 *   node build-odds-history.mjs [--root <dir>]
 *
 * data/odds-snapshot.json is rewritten by build-odds-snapshot.mjs several times a week,
 * and every copy of it is a reading of what the site believed at that moment.
 * Nothing else keeps that record, so this adds each reading's matchup rows to
 * data/odds-history.json:
 *
 *   data/odds-history.json = { _comment, generated,
 *     weeks: { "<season>-<week>": [ { at, a, b, pA, aPts, bPts, settled }, ... ] },
 *     teamWeeks: { "<season>-<week>": [ { at, uid, rid, manager, playoff, title }, ... ] } }
 *
 * teamWeeks is each team's playoff and title chance once a week is final, read
 * off the working-tree snapshot when it was taken between weeks (see
 * teamRowsFromSnapshot). Unlike weeks, a week there is REPLACED whole each time
 * it is read again, so it holds the latest between-weeks reading and never
 * duplicates a team.
 *
 * weeks MERGES: rows already in the file are never removed or rewritten, and new
 * ones come from every commit of the snapshot git can see plus the working-tree
 * copy (in the data job, written moments before and not committed yet). So a
 * shallow checkout, which sees one commit or none, still only ever adds.
 *
 * Read-only against git. The only thing it writes is data/odds-history.json,
 * and only when there is something new. Every problem is a warning and exit 0:
 * this must never stop the data commit.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeHistory, rowKey, rowsFromSnapshot, setTeamWeek, teamRowsFromSnapshot } from "./odds-history.mjs";

const argv = process.argv.slice(2);
const at = argv.indexOf("--root");
const ROOT = at >= 0 && argv[at + 1] ? resolve(argv[at + 1]) : dirname(fileURLToPath(import.meta.url));
const SNAP = "data/odds-snapshot.json";
const OUT = join(ROOT, "data/odds-history.json");

const warn = msg => console.log(`::warning::odds history: ${msg}`);
const git = args => execFileSync("git", args, {
  cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
});

let existing = null;
if (existsSync(OUT)) {
  try { existing = JSON.parse(readFileSync(OUT, "utf8")); }
  catch (e) { warn(`${OUT} is not valid JSON (${e.message}); left untouched.`); process.exit(0); }
  if (!existing || typeof existing !== "object" || !existing.weeks || typeof existing.weeks !== "object" || Array.isArray(existing.weeks)) {
    warn(`${OUT} has no weeks object; left untouched.`);
    process.exit(0);
  }
  // A week that isn't a list is as unreadable as a bad file: merging would
  // replace it with an empty list, so leave everything alone instead.
  const badWeek = Object.keys(existing.weeks).find(k => !Array.isArray(existing.weeks[k]));
  if (badWeek) { warn(`${OUT} week ${badWeek} is not a list; left untouched.`); process.exit(0); }
  const tw = existing.teamWeeks;
  if (tw !== undefined && (!tw || typeof tw !== "object" || Array.isArray(tw) || Object.values(tw).some(w => !Array.isArray(w)))) {
    warn(`${OUT} teamWeeks is not a map of lists; left untouched.`);
    process.exit(0);
  }
}

const incoming = [];
let log = [];
try { log = git(["log", "--format=%H%x09%cI", "--", SNAP]).trim().split("\n").filter(Boolean); }
catch { log = []; }
for (const line of log) {
  const [sha, committed] = line.split("\t");
  try { incoming.push(...rowsFromSnapshot(JSON.parse(git(["show", `${sha}:${SNAP}`])), committed)); }
  catch { /* an unreadable copy adds nothing */ }
}
const working = join(ROOT, SNAP);
let workingSnap = null;
if (existsSync(working)) {
  try {
    const snap = workingSnap = JSON.parse(readFileSync(working, "utf8"));
    // Without its own clock a working copy has no stable time, and stamping it
    // with "now" would re-add the same reading on every run.
    if (snap && snap.generated) incoming.push(...rowsFromSnapshot(snap, snap.generated));
    else warn(`working-tree ${SNAP} has no generated time; skipped.`);
  }
  catch (e) { warn(`working-tree ${SNAP} unreadable (${e.message}); skipped.`); }
}

const merged = mergeHistory(existing, incoming);
const { added } = merged;
let out = merged.out, teamWeek = null;
const final = teamRowsFromSnapshot(workingSnap);
if (final) {
  const set = setTeamWeek(out, final.key, final.rows);
  out = set.out;
  if (set.changed) teamWeek = final.key;
}
const count = h => Object.values(h?.weeks || {}).reduce((n, w) => n + (Array.isArray(w) ? w.length : 0), 0);
const before = count(existing), total = count(out);

const kept = new Set(Object.entries(out.weeks).flatMap(([k, rows]) => rows.map(r => rowKey(k, r))));
const lost = Object.entries(existing?.weeks || {}).some(([k, rows]) =>
  Array.isArray(rows) && rows.some(r => !kept.has(rowKey(k, r))));
if (lost || total < before) {
  warn(`merge would drop rows (${before} → ${total}); left untouched.`);
  process.exit(0);
}

if (added > 0 || teamWeek) {
  out._comment = "Written by build-odds-history.mjs from data/odds-snapshot.json: every committed copy git can see plus the working-tree one. " +
    "weeks rows are merged across runs and never removed or rewritten. One row per matchup per snapshot; " +
    "pA is the chance manager a beats manager b as the site priced it at that moment. " +
    "teamWeeks holds one row per team per finalized week: playoff and title are the site's playoffNow and titleNow " +
    "from a snapshot taken between weeks, and a week there is replaced whole when read again.";
  out.generated = new Date().toISOString();
  const { _comment, generated, weeks, teamWeeks, ...rest } = out;
  writeFileSync(OUT, JSON.stringify({ _comment, generated, weeks, teamWeeks, ...rest }, null, 1) + "\n");
}
console.log(`odds history: ${before} existing rows, ${added} added, ${total} total` +
  (teamWeek ? `; team odds for ${teamWeek} written` : final ? `; team odds for ${final.key} unchanged` : "") +
  (added || teamWeek ? "" : " (file unchanged)"));
