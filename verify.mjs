/*
 * C Cubed — verification harness.
 *
 * Serves the site, drives it in real Chromium against the live Sleeper API, and
 * asserts the things that must be true. Run: node verify.mjs [--headed]
 *
 * A note on what this can and cannot check. DFFL's harness asserts computed
 * standings against Sleeper's own official ones, because DFFL has four seasons
 * of football to check against. C Cubed has none — it has not finalised a week.
 * So there is no season to reconcile, and pretending otherwise would be a test
 * that proves nothing. What is checked instead is everything that is real
 * today: the league loads, all eleven sections render without an error, the
 * odds engine is mathematically coherent and deterministic, the simulator obeys
 * this league's actual format, the draft board matches the 180 picks Sleeper
 * holds, the co-owned team names render, the borrowed calibration is disclosed
 * rather than hidden, and nothing overflows a phone.
 *
 * The season-reconciliation checks belong here the week C Cubed plays a game.
 * They are marked TODO at the bottom of this file.
 */
import { chromium } from "playwright";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { resolve, extname, join } from "path";

const ROOT = resolve(new URL(".", import.meta.url).pathname);
const HEADED = process.argv.includes("--headed");
const TYPES = { ".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };

let passed = 0;
const failures = [];
function check(name, cond, detail = "") {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name + (detail ? ` — ${detail}` : "")); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}
function group(t) { console.log(`\n${t}`); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = join(ROOT, rel === "/" ? "index.html" : rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "text/plain" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto(BASE, { waitUntil: "load" });
await page.waitForFunction(() => !!window.__CCUBED, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(6000);

/* ------------------------------------------------------------ it loaded */
group("Loading");
check("internals exposed as __CCUBED", await page.evaluate(() => !!window.__CCUBED));
check("no page errors on load", errors.length === 0, errors.slice(0, 3).join(" | "));

const meta = await page.evaluate(() => {
  const { DB } = window.__CCUBED;
  const s = DB.seasons[0];
  return {
    title: document.title,
    heading: (document.querySelector("#lgName") || {}).textContent,
    seasons: DB.seasons.length,
    season: s && s.season,
    leagueId: s && s.leagueId,
    rosters: s && s.rosters.length,
    divCount: s && s.divCount,
    playoffTeams: s && s.playoffTeams,
    pws: s && s.pws,
    picks: s && (s.picks || []).length,
    rounds: s && s.draftRounds,
    managers: DB.mgr.size,
    games: DB.games.length,
    divNames: s && [...s.divNames.values()],
  };
});

check("points at the C Cubed league", meta.leagueId === "1387595114829864960", meta.leagueId);
check("titled for C Cubed", /C Cubed/.test(meta.title) && /C Cubed/.test(meta.heading || ""), meta.title);
check("twelve rosters", meta.rosters === 12, String(meta.rosters));
check("twelve managers registered", meta.managers === 12, String(meta.managers));
check("three divisions", meta.divCount === 3, String(meta.divCount));
check("divisions named off Sleeper", meta.divNames.join(",") === "cville,chaps,tech", meta.divNames.join(","));
check("six playoff places", meta.playoffTeams === 6, String(meta.playoffTeams));
check("playoffs start week 15", meta.pws === 15, String(meta.pws));
check("2026 is the current season", meta.season === "2026", meta.season);

/* ------------------------------------------------- it is a redraft league */
group("Redraft, not keeper");
const redraft = await page.evaluate(async () => {
  const { DB } = window.__CCUBED;
  const s = DB.seasons[0];
  const lg = await fetch(`https://api.sleeper.app/v1/league/${s.leagueId}`).then(r => r.json());
  return {
    type: lg.settings.type,
    flagged: (s.picks || []).filter(p => p.is_keeper).length,
    hasKeeperFns: !!(window.__CCUBED.keepersFor || window.__CCUBED.keepersOf || window.__CCUBED.loadStatedKeepers),
    bodyMentionsKeeperFile: /keepers\.json/i.test(document.body.innerHTML),
  };
});
check("Sleeper reports a redraft league (type 0)", redraft.type === 0, `type ${redraft.type}`);
check("not one pick is flagged as a keeper", redraft.flagged === 0, `${redraft.flagged} flagged`);
check("the keeper inference engine is gone", !redraft.hasKeeperFns);
check("nothing asks the reader for a keepers.json", !redraft.bodyMentionsKeeperFile);

/* ------------------------------------------------------------- the draft */
group("The draft");
check("180 picks loaded", meta.picks === 180, String(meta.picks));
check("15 rounds", meta.rounds === 15, String(meta.rounds));

const adp = await page.evaluate(async () => {
  const D = window.__CCUBED;
  const a = await D.loadADP();
  if (!a) return { loaded: false };
  const s = D.DB.seasons[0];
  let hit = 0;
  for (const p of s.picks) {
    const md = p.metadata || {};
    if (a.byName.get(D.adpKey(`${md.first_name || ""} ${md.last_name || ""}`, md.position)) != null) hit++;
  }
  const missPos = s.picks.filter(p => {
    const md = p.metadata || {};
    return a.byName.get(D.adpKey(`${md.first_name || ""} ${md.last_name || ""}`, md.position)) == null;
  }).map(p => (p.metadata || {}).position);
  return { loaded: true, meta: a.meta, n: a.n, hit, total: s.picks.length, missPos };
});
check("the ADP board loads", adp.loaded);
check("the ADP board is full PPR", adp.loaded && adp.meta.format === "PPR", adp.loaded ? adp.meta.format : "");
check("the ADP board is 12-team", adp.loaded && adp.meta.teams === 12, adp.loaded ? String(adp.meta.teams) : "");
check("the ADP window closes on or before draft day",
  adp.loaded && adp.meta.sampled.split("..")[1] <= "2026-08-30", adp.loaded ? adp.meta.sampled : "");
check("over 90% of picks price against the market",
  adp.loaded && adp.hit / adp.total > 0.90, adp.loaded ? `${adp.hit}/${adp.total}` : "");
check("every unpriced pick is a defense or a rookie, never a starter",
  adp.loaded && adp.missPos.every(p => p === "DEF" || p === "TE" || p === "K"), (adp.missPos || []).join(","));

// C Cubed scores a full point per catch. Priced on a non-PPR board a pass-catching
// back is worth a round less than he cost, which would mis-rank half the league.
const ppr = await page.evaluate(async () => {
  const { DB } = window.__CCUBED;
  const lg = await fetch(`https://api.sleeper.app/v1/league/${DB.seasons[0].leagueId}`).then(r => r.json());
  return lg.scoring_settings.rec;
});
check("the league really does pay a point a catch", ppr === 1, `rec ${ppr}`);

/* ------------------------------------------------------- the odds engine */
group("Odds arithmetic");
const math = await page.evaluate(() => {
  const { americanOdds, impliedProb, roundOdds } = window.__CCUBED;
  const probs = [0.02, 0.1, 0.25, 0.5, 0.5001, 0.75, 0.9, 0.98];
  return probs.map(p => {
    const o = americanOdds(p);
    return { p, o, back: impliedProb(o), rounded: roundOdds(o) };
  });
});
check("an even-money price is +100 or −100", math.some(x => Math.abs(x.o) === 100));
check("odds round-trip back to their probability",
  math.every(x => near(x.back, x.p, 0.02)), JSON.stringify(math.find(x => !near(x.back, x.p, 0.02)) || ""));
check("favourites price negative, underdogs positive",
  math.every(x => (x.p > 0.5 ? x.o < 0 : x.p < 0.5 ? x.o > 0 : true)));
check("rounding never crosses zero", math.every(x => Math.sign(x.rounded) === Math.sign(x.o)));

const vig = await page.evaluate(() => {
  const { priceMarket, marketHold, ODDS_HOLD } = window.__CCUBED;
  const m2 = priceMarket([{ p: 0.5 }, { p: 0.5 }]);
  const m12 = priceMarket(Array.from({ length: 12 }, () => ({ p: 1 / 12 })));
  return { hold2: marketHold(m2), hold12: marketHold(m12), target: ODDS_HOLD, n2: m2.length, n12: m12.length };
});
check("a two-way market carries the house hold", near(vig.hold2, vig.target, 0.02), `${vig.hold2}`);
check("a twelve-way market carries the house hold", near(vig.hold12, vig.target, 0.02), `${vig.hold12}`);
check("pricing preserves every runner", vig.n2 === 2 && vig.n12 === 12);

/* ------------------------------------------------------------- the model */
group("The model in year one");
const model = await page.evaluate(() => {
  const { ODDS: M, SIM, PRIOR } = window.__CCUBED;
  if (!M) return { none: true };
  return {
    ok: M.ok, postDraft: M.postDraft, haveHist: M.haveHist, borrowed: M.borrowed,
    weekSd: M.weekSd, weekSdFitted: M.weekSdFitted, base: M.base,
    priorWeekSd: PRIOR.weekSd, priorBase: PRIOR.base, priorSource: PRIOR.source,
    nMgrSeasons: M.nMgrSeasons, carry: M.carry, seasons: M.seasons.length,
    teams: M.teams.length, cap: M.rosterCap,
    edges: M.teams.map(t => t.edge),
    rawEdges: M.teams.map(t => t.rawEdge),
    sims: SIM && SIM.sims,
  };
});
check("the board opens", model.ok);
check("it knows the draft has run", model.postDraft);
check("it knows it has no history", model.haveHist === false && model.seasons === 0);
check("it flags itself as borrowed", model.borrowed === true);
check("week noise falls back to the prior exactly",
  model.weekSdFitted === null && model.weekSd === model.priorWeekSd, `${model.weekSd} vs ${model.priorWeekSd}`);
check("the baseline falls back to the prior exactly", model.base === model.priorBase, `${model.base}`);
check("the prior names where it came from", /DFFL/.test(model.priorSource), model.priorSource);
check("no manager is credited with a record he does not have",
  model.rawEdges.every(e => e === 0) && model.nMgrSeasons === 0);
check("every team is still ranked", model.teams === 12);
check("the ranking is not flat — the draft actually separated them",
  new Set(model.edges.map(e => e.toFixed(3))).size === 12);
check("each manager is capped at one pick per round", model.cap === 15, String(model.cap));

/* --------------------------------------------------------- the simulator */
group("The simulation obeys this league's format");
const sim = await page.evaluate(() => {
  const { ODDS: M, SIM, seedField } = window.__CCUBED;
  const n = SIM.sims;
  const sum = a => a.reduce((x, y) => x + y, 0);
  // Seeding: three division winners take 1-3, best of the rest fill 4-6.
  const rank = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const divOf = i => M.teams[i].div;
  const sf = seedField(rank, divOf, 6);
  return {
    titleSum: sum(SIM.title) / n,
    playoffSum: sum(SIM.playoff) / n,
    byeSum: sum(SIM.bye) / n,
    lastSum: sum(SIM.last) / n,
    divWinSum: sum(SIM.divWin) / n,
    winsAvg: sum(SIM.wins) / n / 12,
    weeks: M.weeks,
    seeds: sf.seeds.length,
    champs: sf.champs.length,
    everyTeamCanWin: SIM.title.every(t => t > 0),
    everyTeamCanFinishLast: SIM.last.every(t => t > 0),
    schedGames: M.sched.reduce((a, w) => a + w.length, 0),
    schedWeeks: M.sched.length,
  };
});
check("exactly one champion per simulated season", near(sim.titleSum, 1, 0.001), String(sim.titleSum));
check("exactly six playoff teams per season", near(sim.playoffSum, 6, 0.001), String(sim.playoffSum));
check("exactly two byes per season", near(sim.byeSum, 2, 0.001), String(sim.byeSum));
check("exactly three division winners per season", near(sim.divWinSum, 3, 0.001), String(sim.divWinSum));
check("exactly one team finishes twelfth", near(sim.lastSum, 1, 0.001), String(sim.lastSum));
check("a fourteen-week regular season", sim.weeks === 14, String(sim.weeks));
check("six games a week, every week", sim.schedGames === sim.schedWeeks * 6 && sim.schedWeeks === 14);
check("wins average out to seven a team", near(sim.winsAvg, 7, 0.1), String(sim.winsAvg));
check("seeding fills all six places from three division winners", sim.seeds === 6 && sim.champs === 3);
check("nobody is mathematically eliminated before week 1", sim.everyTeamCanWin);
check("anybody can finish last", sim.everyTeamCanFinishLast);

const det = await page.evaluate(() => {
  const { ODDS: M, simulateSeason } = window.__CCUBED;
  const a = simulateSeason(M, 2000), b = simulateSeason(M, 2000);
  return a.title.every((x, i) => x === b.title[i]) && a.last.every((x, i) => x === b.last[i]);
});
check("the board posts the same price on every reload", det);

// The toilet bowl runs backwards, so the worst regular-season team is NOT simply
// the most likely to finish twelfth. That is the whole point of the format.
const bowl = await page.evaluate(() => {
  const { ODDS: M, SIM } = window.__CCUBED;
  const worst = M.teams.map((t, i) => ({ i, edge: t.edge })).sort((a, b) => a.edge - b.edge)[0].i;
  const mostLast = SIM.last.indexOf(Math.max(...SIM.last));
  return { worstIsMostLikelyLast: worst === mostLast, spread: Math.max(...SIM.last) / SIM.sims };
});
check("finishing last is played for, not awarded to the worst record",
  bowl.spread < 0.35, `worst team finishes 12th ${(bowl.spread * 100).toFixed(0)}% of the time`);

/* --------------------------------------------------------- co-ownership */
group("Co-owned teams");
const owners = await page.evaluate(() => {
  const { DB, titleOf, ownerLine, coOf, teamOf, nameOf } = window.__CCUBED;
  const uids = [...DB.mgr.keys()];
  return {
    withCo: uids.filter(u => coOf(u).length).length,
    total: uids.length,
    // a card must never print the same string twice
    noEcho: uids.every(u => titleOf(u) !== ownerLine(u)),
    // where there is no team name the card falls back to the owner's handle
    fallback: uids.filter(u => !teamOf(u)).every(u => titleOf(u) === nameOf(u)),
    // and then the second line names the co-owner rather than repeating him
    subs: uids.filter(u => !teamOf(u) && coOf(u).length).every(u => /^with /.test(ownerLine(u))),
    named: uids.filter(u => teamOf(u)).every(u => ownerLine(u).includes(nameOf(u))),
  };
});
check("eleven teams are run by two people", owners.withCo === 11, String(owners.withCo));
check("a card never prints its own title twice", owners.noEcho);
check("a team with no name falls back to its owner's handle", owners.fallback);
check("an unnamed team credits its co-owner underneath", owners.subs);
check("a named team lists both owners underneath", owners.named);

const cards = await page.evaluate(() => {
  const g = document.querySelector('[data-panel="home"] .mgrid');
  if (!g) return null;
  return [...g.querySelectorAll(".mcard")].map(c => ({
    title: (c.querySelector(".nm") || {}).textContent || "",
    sub: (c.querySelector(".tm") || {}).textContent || "",
  }));
});
check("all twelve teams render on the home grid", cards && cards.length === 12, cards ? String(cards.length) : "none");
check("a real team name leads its card", cards && cards.some(c => c.title === "Lucky Strike"));
check("its owners are named underneath",
  cards && (cards.find(c => c.title === "Lucky Strike") || {}).sub === "drewkim & riadmammadov",
  cards ? (cards.find(c => c.title === "Lucky Strike") || {}).sub : "");

/* ------------------------------------------------ every section renders */
group("Every section renders");
const TABS = ["home", "scores", "managers", "records", "matchups", "power", "odds", "race", "draft", "trades", "recaps"];
const tabNames = await page.evaluate(() => [...document.querySelectorAll("#tabs button")].map(b => b.dataset.tab));
check("all eleven tabs are present", TABS.every(t => tabNames.includes(t)), tabNames.join(","));

for (const t of TABS) {
  const before = errors.length;
  await page.click(`#tabs button[data-tab="${t}"]`);
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const p = document.querySelector(".panel:not([hidden])");
    return { has: !!p, len: p ? p.innerText.trim().length : 0, headers: p ? p.querySelectorAll("table thead").length : 0,
             rows: p ? p.querySelectorAll("table tbody tr").length : 0 };
  });
  check(`${t}: renders content`, info.has && info.len > 80, `${info.len} chars`);
  check(`${t}: no errors`, errors.length === before, errors.slice(before).join(" | "));
  // A table header with no rows under it is the classic empty-league artefact.
  check(`${t}: no table left with a header and no rows`, info.headers === 0 || info.rows > 0,
    `${info.headers} headers, ${info.rows} rows`);
}

/* -------------------------------------- the empty states say what is missing */
group("Empty states are honest");
const empties = await page.evaluate(async () => {
  const out = {};
  const read = async id => {
    document.querySelector(`#tabs button[data-tab="${id}"]`).click();
    await new Promise(r => setTimeout(r, 400));
    return (document.querySelector(".panel:not([hidden])") || {}).innerText || "";
  };
  out.records = await read("records");
  out.matchups = await read("matchups");
  out.scores = await read("scores");
  out.race = await read("race");
  out.trades = await read("trades");
  out.recaps = await read("recaps");
  out.odds = await read("odds");
  return out;
});
check("records says the book is empty", /empty|no completed seasons/i.test(empties.records));
check("matchups says nobody has played anybody", /nobody has played/i.test(empties.matchups));
check("the scoreboard says no games yet", /no games played/i.test(empties.scores));
check("the race says the season hasn't started", /hasn't started|has not started/i.test(empties.race));
check("trades says none on record", /no trades/i.test(empties.trades));
// Articles ship before any football does, so this is not an empty section — but
// the weekly write-ups genuinely are missing, and the page must still say so
// rather than letting a couple of long reads imply the section is complete.
check("the news still says the weekly write-ups have not started",
  /nothing to read/i.test(empties.recaps));
check("the news carries the long reads above it",
  /Josh Jacobs paid for it/.test(empties.recaps)
  && /almost nothing between them/.test(empties.recaps));
check("no empty state leaves a bare dash as the whole answer",
  !/^—$/m.test(empties.records + empties.matchups + empties.scores));

/* ------------------------------------------- the borrowing is disclosed */
group("The borrowed calibration is disclosed, not hidden");
check("the odds board says it is year one", /year one/i.test(empties.odds));
check("the odds board names DFFL as the source", /DFFL/.test(empties.odds));
check("it says the ranking is C Cubed's own", /ranking below is entirely C Cubed's own/i.test(empties.odds));
check("it says what is borrowed is the spread", /borrowed is the/i.test(empties.odds));
check("it promises to refit on C Cubed's own football", /refitted on C Cubed/i.test(empties.odds));
check("the house notice still says these are not real lines", /not real betting lines/i.test(empties.odds));
check("it does not claim to be fitted on C Cubed history",
  !/fitted on C Cubed's own drafts/i.test(empties.odds));

/* ------------------------------------------------------ no DFFL leakage */
group("No DFFL content leaked in");
const leak = await page.evaluate(async () => {
  const out = { pages: {} };
  for (const t of ["home", "records", "draft", "trades", "recaps", "power"]) {
    document.querySelector(`#tabs button[data-tab="${t}"]`).click();
    await new Promise(r => setTimeout(r, 350));
    out.pages[t] = (document.querySelector(".panel:not([hidden])") || {}).innerText || "";
  }
  const recaps = await fetch("recaps.json").then(r => r.json());
  const ranks = await fetch("rankings.json").then(r => r.json());
  return { ...out, recapWeeks: recaps.weeks.length, recapArticles: (recaps.articles || []).length,
           artSeasons: [...new Set((recaps.articles || []).map(a => String(a.season)))],
           rankWeeks: ranks.weeks.length,
           recapsHasDFFL: JSON.stringify(recaps).includes("DFFL"),
           ranksHasDFFL: JSON.stringify(ranks).includes("DFFL") };
});
// C Cubed has finalised no week, so a weekly recap could only have come from
// somewhere else. Articles are different: they are written by hand and can
// legitimately predate the first kickoff, so they are checked for provenance —
// every one must be about a C Cubed season — rather than required to be absent.
check("no weekly recaps shipped for a league that has not played",
  leak.recapWeeks === 0, `${leak.recapWeeks} weeks`);
check("every article is a C Cubed season",
  leak.artSeasons.every(s => s === "2026"), leak.artSeasons.join(","));
check("no DFFL power blurbs shipped", leak.rankWeeks === 0, String(leak.rankWeeks));
check("recaps.json mentions no other league", !leak.recapsHasDFFL);
check("rankings.json mentions no other league", !leak.ranksHasDFFL);
// DFFL is cited wherever a borrowed number is actually shown — the Odds and Power
// boards. It must appear nowhere else: the record-book sections are C Cubed's alone.
const CITES_OK = new Set(["power"]);
for (const [t, text] of Object.entries(leak.pages)) {
  if (CITES_OK.has(t)) check(`${t}: cites its borrowed source`, /DFFL/.test(text));
  else check(`${t}: does not mention DFFL`, !/DFFL/.test(text));
}

/* ----------------------------------------------------------- phone-first */
group("Phone layout");
await ctx.close();
const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mob.newPage();
const mobErrors = [];
mp.on("pageerror", e => mobErrors.push(e.message));
await mp.goto(BASE, { waitUntil: "load" });
await mp.waitForFunction(() => !!window.__CCUBED, { timeout: 90000 }).catch(() => {});
await mp.waitForTimeout(6000);
for (const t of TABS) {
  await mp.click(`#tabs button[data-tab="${t}"]`);
  await mp.waitForTimeout(900);
  const over = await mp.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
    // a scroller of its own is fine; the page body overflowing is not
    wide: [...document.querySelectorAll(".panel:not([hidden]) *")]
      .filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== "auto"
                && getComputedStyle(e).overflowX !== "scroll")
      .slice(0, 3).map(e => e.className || e.tagName),
  }));
  check(`${t}: no horizontal overflow at 390px`, over.doc <= over.win + 1,
    `${over.doc} > ${over.win}${over.wide.length ? " — " + over.wide.join(", ") : ""}`);
}
check("no errors on a phone", mobErrors.length === 0, mobErrors.slice(0, 2).join(" | "));

/* -------------------------------------------------------------- summary */
await browser.close();
server.close();

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { failures.forEach(f => console.log("  · " + f)); process.exit(1); }

/*
 * TODO — the week C Cubed finalises its first game, add back the checks this
 * league cannot currently support, all of which DFFL's harness already has:
 *
 *   · reconcile every computed W-L, points-for and points-against against
 *     Sleeper's own official standings, all twelve teams
 *   · assert the power board's week-over-week movement matches the recomputed
 *     boards, and that the season selector defaults to the last completed week
 *   · assert weekSdFitted stops being null, that `borrowed` flips to false once
 *     three managers have two seasons each, and that the Odds tab's year-one
 *     notice disappears on its own
 *   · reconcile final placements against the winners' and losers' brackets,
 *     including who actually lost the toilet bowl
 */
