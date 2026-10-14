/**
 * Should a new recap be written right now? Read-only; writes and sends nothing.
 *
 *   node recap-guard.mjs          # prints each condition, exit 0 = write, 1 = do not
 *   node recap-guard.mjs --json   # the same, for a script
 *
 * Reads data/latest.json (written by build-week.mjs in the Action) and
 * recaps.json. Four conditions, all of which must hold:
 *
 *   final   latest.json says the week is final: every NFL game complete and
 *           every league matchup scored.
 *   week    Sleeper's week as recorded in latest.json (sleeper_state.week) is
 *           latest.week + 1, or still latest.week while final is true.
 *           Sleeper advances its week hours after Monday night's game ends, so
 *           at 1 AM Tuesday "== week + 1" alone would refuse nearly every real
 *           Tuesday. Anything else — two weeks behind, a different season,
 *           behind latest — fails.
 *   fresh   generated_at is under 12 hours old. File mtimes in a git checkout
 *           mean nothing; only this timestamp does. It proves the Action ran
 *           recently, nothing more.
 *   new     recaps.json has no weeks[] entry for that week and no Tuesday
 *           article (source "tuesday") whose kicker names it. This is what
 *           stops the same week being written up twice.
 *
 * The same "Sleeper hasn't flipped but the week is final" reading is what the
 * site uses (effective-week.mjs).
 */
import { readFile } from "fs/promises";

export function recapGuard({ latest, recaps, now = Date.now(), maxAgeHours = 12 }) {
  const l = latest || {};
  const st = l.sleeper_state || {};
  const week = Number(l.week);
  const season = l.season != null ? String(l.season) : null;
  const hasWeek = Number.isInteger(week) && week >= 1 && !!season;
  const name = hasWeek ? `${season} week ${week}` : "(no week)";
  const checks = [];
  const add = (id, ok, message) => checks.push({ id, ok: !!ok, message });

  add("final", l.final === true,
    l.final === true ? `latest.json says ${name} is final`
      : `latest.json does not say ${name} is final (final is ${JSON.stringify(l.final)})`);

  const sw = Number(st.week);
  const sSeason = st.season != null ? String(st.season) : null;
  let weekOk = false, weekMsg;
  if (!hasWeek) weekMsg = "latest.json has no usable season/week";
  else if (st.week === undefined || st.week === null || !Number.isFinite(sw))
    weekMsg = "latest.json has no sleeper_state.week, so the week cannot be checked";
  else if (sSeason !== season)
    weekMsg = `Sleeper was in season ${sSeason}, latest.json is ${season}`;
  else if (sw === week + 1) { weekOk = true; weekMsg = `Sleeper had moved on to week ${sw}, one past ${name}`; }
  else if (sw === week && l.final === true) { weekOk = true; weekMsg = `Sleeper still called week ${sw} current, and it is final`; }
  else if (sw === week) weekMsg = `Sleeper still called week ${sw} current and it is not marked final`;
  else weekMsg = `Sleeper was at week ${sw}; latest.json is week ${week}, so it is ${sw > week ? "stale" : "ahead of Sleeper"}`;
  add("week", weekOk, weekMsg);

  const t = Date.parse(l.generated_at);
  const nowMs = typeof now === "number" ? now : Date.parse(now);
  const ageH = (nowMs - t) / 36e5;
  let freshOk = false, freshMsg;
  if (!l.generated_at || !Number.isFinite(t)) freshMsg = "latest.json has no generated_at";
  else if (ageH < -0.25) freshMsg = `generated_at ${l.generated_at} is in the future`;
  else if (ageH >= maxAgeHours) freshMsg = `generated_at ${l.generated_at} is ${ageH.toFixed(1)} hours old (limit ${maxAgeHours})`;
  else { freshOk = true; freshMsg = `generated_at is ${Math.max(0, ageH).toFixed(1)} hours old`; }
  add("fresh", freshOk, freshMsg);

  const r = recaps || {};
  const inWeeks = (r.weeks || []).some(w => String(w.season) === season && Number(w.week) === week);
  const kicker = new RegExp(`^${season} · week ${week}\\b`);
  const art = (r.articles || []).find(a => a && a.source === "tuesday" && kicker.test(String(a.kicker || "")));
  add("new", hasWeek && !inWeeks && !art,
    !hasWeek ? "no week to check against recaps.json"
      : inWeeks ? `recaps.json already has a weeks[] entry for ${name}`
        : art ? `recaps.json already has the ${name} Tuesday article (${art.slug})`
          : `recaps.json has nothing for ${name} yet`);

  const failed = checks.filter(c => !c.ok);
  return { ok: failed.length === 0, recap: hasWeek ? { season, week } : null, checks, failed: failed.map(c => c.id) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const latest = JSON.parse(await readFile("data/latest.json", "utf8").catch(() => "{}"));
  const recaps = JSON.parse(await readFile("recaps.json", "utf8").catch(() => "{}"));
  const res = recapGuard({ latest, recaps, now: Date.now() });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(res, null, 1));
  } else {
    for (const c of res.checks) console.log(`${c.ok ? "pass" : "FAIL"}  ${c.id.padEnd(6)} ${c.message}`);
    console.log(res.ok
      ? `\nverdict: WRITE — the ${res.recap.season} week ${res.recap.week} recap may be written.`
      : `\nverdict: DO NOT WRITE — failed: ${res.failed.join(", ")}. Write no recap and say which condition failed.`);
  }
  process.exit(res.ok ? 0 : 1);
}
