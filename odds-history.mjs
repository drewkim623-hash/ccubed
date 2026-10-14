/**
 * The pure half of build-odds-history.mjs: turn an odds snapshot into rows, and
 * merge rows into the history without ever losing or rewriting one.
 *
 *   data/odds-history.json = { _comment, generated,
 *     weeks: { "<season>-<week>": [ { at, a, b, pA, aPts, bPts, settled }, ... ] },
 *     teamWeeks: { "<season>-<week>": [ { at, uid, rid, manager, playoff, title }, ... ] } }
 *
 * No I/O here; test-odds-history.mjs exercises it directly.
 */

// The rows one data/odds-snapshot.json yields, as [{ key, row }].
export function rowsFromSnapshot(snap, fallbackAt) {
  if (!snap || typeof snap !== "object") return [];
  const games = Array.isArray(snap.games) ? snap.games : [];
  // The games on a snapshot belong to the week in flight; fall back to the
  // snapshot's own week when nothing was live.
  const week = snap.liveWeek ?? snap.week;
  if (!games.length || week == null || !snap.season) return [];
  const key = `${snap.season}-${week}`;
  // The snapshot's own clock, not the commit's: a copy can be committed well
  // after it was taken.
  const at = snap.generated || fallbackAt;
  const out = [];
  for (const g of games) {
    if (!g || !g.a || !g.b || typeof g.pA !== "number") continue;
    out.push({ key, row: {
      at, a: g.a, b: g.b, pA: g.pA,
      aPts: g.aPts ?? 0, bPts: g.bPts ?? 0, settled: !!g.settled,
    } });
  }
  return out;
}

// One reading of one game in one week.
export const rowKey = (key, row) => `${key}|${row.at}|${row.a}|${row.b}`;

const time = row => {
  const t = Date.parse(row.at);
  return Number.isNaN(t) ? Infinity : t;
};

// existing: the parsed file (or null). incoming: [{ key, row }].
// Existing rows are kept exactly as they are, even when an incoming row shares
// their rowKey; only rows with a new rowKey are appended. Returns { out, added }.
export function mergeHistory(existing, incoming) {
  const weeks = {};
  const seen = new Set();
  for (const [key, rows] of Object.entries(existing?.weeks || {})) {
    weeks[key] = Array.isArray(rows) ? rows.slice() : [];
    for (const row of weeks[key]) seen.add(rowKey(key, row));
  }
  let added = 0;
  for (const { key, row } of incoming || []) {
    const k = rowKey(key, row);
    if (seen.has(k)) continue;
    seen.add(k);
    (weeks[key] ||= []).push(row);
    added++;
  }
  // Array.prototype.sort is stable, so rows taken at the same moment keep
  // their order.
  for (const k of Object.keys(weeks)) weeks[k].sort((x, y) => {
    const a = time(x), b = time(y);
    return a === b ? 0 : a < b ? -1 : 1;
  });
  const out = {
    ...(existing && typeof existing === "object" ? existing : {}),
    weeks: Object.fromEntries(Object.keys(weeks).sort().map(k => [k, weeks[k]])),
  };
  return { out, added };
}

// ---- each team's odds at the end of each finalized week ----------------------
//
//   teamWeeks: { "<season>-<week>": [ { at, uid, rid, manager, playoff, title }, ... ] }
//
// Beside weeks, not in it: weeks keeps the matchup rows exactly as DFFL writes
// them. playoff and title are the snapshot's playoffNow and titleNow, copied
// as they are (fractions, not rounded).

// The finalized week a snapshot describes, as { key, rows }, or null. Only a
// reading taken between weeks counts: no week live, and the games decided are
// exactly every game of the weeks before snap.week. The week on such a reading
// is the next one to be played, so the finished one is week - 1.
export function teamRowsFromSnapshot(snap) {
  if (!snap || typeof snap !== "object" || !snap.season || snap.liveWeek != null) return null;
  const teams = Array.isArray(snap.teams) ? snap.teams : [];
  const week = Number(snap.week) - 1;
  if (!Number.isInteger(week) || week < 1 || !teams.length || teams.length % 2) return null;
  if (snap.decided !== week * teams.length / 2) return null;
  if (!teams.every(t => t && t.uid && typeof t.playoffNow === "number" && typeof t.titleNow === "number")) return null;
  const at = snap.generated || null;
  return {
    key: `${snap.season}-${week}`,
    rows: teams.map(t => ({ at, uid: t.uid, rid: t.rid ?? null, manager: t.manager ?? null, playoff: t.playoffNow, title: t.titleNow })),
  };
}

// existing: the parsed file (or null). Replaces that one week's team rows, so
// running a week again never duplicates it. Returns { out, changed }.
export function setTeamWeek(existing, key, rows) {
  const base = existing && typeof existing === "object" ? existing : {};
  const prev = base.teamWeeks && typeof base.teamWeeks === "object" && !Array.isArray(base.teamWeeks) ? base.teamWeeks : {};
  const next = { ...prev, [key]: rows.slice().sort((x, y) => String(x.uid).localeCompare(String(y.uid))) };
  const out = { ...base, teamWeeks: Object.fromEntries(Object.keys(next).sort().map(k => [k, next[k]])) };
  return { out, changed: JSON.stringify(prev[key]) !== JSON.stringify(out.teamWeeks[key]) };
}
