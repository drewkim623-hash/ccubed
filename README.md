# C Cubed — League Record Book

A single-page site for the C Cubed fantasy football league. It reads the **public Sleeper API
directly from the visitor's browser**, so there is no server, no database, no API key, and
nothing to keep in sync — the page always matches what the Sleeper app shows.

Eleven sections:

- **Home** — the league at a glance, a tap-anyone team grid, and the preseason projection
- **Scoreboard** — every matchup from any week the league has played, with a season/week picker
- **Managers** — sortable list; tap anyone for a full career profile
- **Records** — trophy case, the all-time record book, best and worst weeks, per-season awards
- **Matchups** — a "pick two managers" comparison, the head-to-head grid, rivalries, schedule swaps
- **Power** — weekly power rankings, rebuilt from scratch each week
- **Odds** — futures priced off the drafted rosters and posted the way a book would post them
- **Race** — live playoff odds once the season is running
- **Draft** — the full board, by manager, and as a list, with each pick graded after the season
- **Trades** — every trade graded on what the players did afterwards; waivers and FAAB too
- **News & Articles** — long reads and weekly write-ups from `recaps.json`

Every section has a "What do these numbers mean?" panel in plain English, and the whole thing is
built phone-first — that's where the league will actually read it.

---

## Read this first: it is season one

C Cubed has **never finalised a week of football**. `previous_league_id` is null on Sleeper —
2026 is the first season this league has ever had. That has three consequences worth knowing
before you send the link round.

**Most of the site is empty on purpose, and fills itself in.** The record book, the head-to-head
grid, the trophy case, the power rankings, the luck board and the career profiles all measure
games. Each one currently shows a short note saying what it is waiting for. The moment week 1
finalises on Sleeper they start working, with no edit and no upload — the page recomputes from
the API on every load.

**What works today** is the **Draft** board (all 180 picks are in), the **Odds** and **Power**
boards, which price the twelve rosters that came out of that draft, and **News & Articles**, which
carries two long reads off that draft. The weekly write-ups underneath them still start at kickoff.

**The odds board's calibration is borrowed, and says so on its face.** The model needs to know
how far apart the teams are *and* how noisy a fantasy week is. The first it gets from C Cubed's
own draft. The second it cannot get from anywhere, because C Cubed has no scoring history — so it
uses DFFL's, measured over 624 degrees of freedom across 2022–2025. DFFL is a sibling twelve-team
Sleeper league with the same divisions, the same six playoff places and the same toilet bowl.

That is defensible rather than a fudge because every probability the board posts depends only on
the *ratio* of team spread to week noise, not on the absolute size of either — and the borrowed
constants are all expressed in the same units, so the ratio stays coherent even though C Cubed
scores full PPR and DFFL does not. **Expect the ordering to be right and the confidence to be
approximate.** The Odds tab states all of this in a panel the reader cannot miss.

None of it has to be maintained. `oddsModel()` refits every one of those constants on C Cubed's
own football as soon as there is enough of it, and the borrowed-calibration notice disappears by
itself.

---

## Getting it online (GitHub Pages, ~5 minutes)

1. Create a new **public** repository. Name it whatever you want — `ccubed` is fine.
2. Upload these files to the root of the repo (the web UI's "uploading an existing file"
   link works — just drag them in):
   - `index.html`
   - `adp-2026.json`
   - `recaps.json`
   - `rankings.json`
   - `README.md` (optional)
3. In the repo go to **Settings → Pages**. Under "Build and deployment" set
   **Source = Deploy from a branch**, **Branch = `main`**, **Folder = `/ (root)`**. Save.
4. Wait about a minute. The site is live at:

   ```
   https://<your-github-username>.github.io/ccubed/
   ```

That URL is what you send the guys. It works on phones.

### If you'd rather use the command line

```bash
git remote add origin https://github.com/<you>/ccubed.git
git push -u origin main
```

Then do step 3 above.

---

## How it finds the league

`index.html` has one line of configuration near the top of the `<script>` block:

```js
const CURRENT_LEAGUE_ID = "1387595114829864960";
```

That is the 2026 C Cubed league. Every offseason Sleeper creates a **new** league ID and links it
to the old one via `previous_league_id`. The site walks that chain backwards automatically, so
**when you roll the league over for 2027 you only change this one line** — and from then on all
the history keeps working by itself.

Currently on record:

| Season | League name | Sleeper league ID |
|---|---|---|
| 2026 | C Cubed | 1387595114829864960 |

### League settings it reads

Nothing below is hardcoded — all of it is read off Sleeper on every load. It is listed so you can
see what the simulation is assuming.

| | |
|---|---|
| Teams | 12 |
| Divisions | 3 — cville, chaps, tech |
| Playoff places | 6, from week 15 |
| Regular season | 14 weeks |
| Scoring | **Full PPR** (1.0 per reception) |
| Roster | QB, RB, RB, WR, WR, TE, FLEX, FLEX, K, DEF + 5 bench |
| Draft | 15 rounds, snake, completed 2026-08-30 |
| Keepers | none — this league re-drafts from scratch |

The one thing the API cannot tell us is how last place is decided, so it is set to the same
**toilet bowl** DFFL runs: seeds 7–12, and you advance by *losing*. The four best of them play the
first round and the two that lose it carry on; the two worst records sit that round out and enter
the next already one defeat from the final; losing the final is twelfth. If C Cubed turns out to
run a normal consolation bracket instead, that is the `C.last` block in `simulateSeason()`.

---

## Co-owned teams

Twenty-three people run twelve teams — eleven of the twelve have two owners. Sleeper hangs the
second name off the *roster*, not the user, so the site reads `co_owners` from there.

Because only half the league has set a team name, a card leads with whatever actually identifies
the team and never repeats itself:

| On Sleeper | Renders as |
|---|---|
| Team name + two owners | **Lucky Strike** / drewkim & riadmammadov |
| No team name + two owners | **andychoe03** / with NathKim |
| No team name, one owner | **bigmoneyjos** |

Compact tables (the head-to-head grid, the odds rows) keep using the single short handle — a
24-character team name does not fit in a grid column.

---

## The draft board and ADP

`adp-2026.json` is the pre-draft market, frozen. It is Fantasy Football Calculator's **12-team
full PPR** board — 8,234 mock drafts sampled 2026-08-23 to 2026-08-30, a window that closes on
C Cubed's own draft day.

**Do not update this file.** The model prices rosters against what the board looked like on draft
day; refreshing it later would silently re-grade a draft against a market that did not exist when
it was made.

167 of the 180 picks (92.8%) match the board by name. The thirteen that don't are twelve team
defenses — Sleeper calls them "Los Angeles Rams", FFC calls them "Los Angeles Defense" — plus one
rookie tight end. All thirteen fall to the board's floor price. Every roster carries about one, so
it barely moves the ordering.

The format matters here: C Cubed pays a full point per reception and DFFL does not, so DFFL's
non-PPR ADP file would have mispriced every pass-catching back by roughly a round. This is a
different file, not a copy.

---

## Weekly recaps

`recaps.json` holds the write-ups, and `rankings.json` the one-line power-board blurbs. Both ship
empty — there is nothing to write about yet. Shape:

```json
{
  "weeks": [
    {
      "season": "2026",
      "week": 1,
      "note": "optional subtitle, e.g. Playoffs - Round 1",
      "games": [
        {
          "headline": "Short game headline",
          "winner": "manager display name",
          "winner_points": 148.22,
          "loser": "manager display name",
          "loser_points": 121.06,
          "body": "Two to four sentences on how the game was won."
        }
      ]
    }
  ],
  "articles": []
}
```

To publish a week, replace `recaps.json` in the repo. On GitHub you can do it in the browser: open
the file, click the pencil icon, paste, commit.

---

## Notes and known limits

- **Nothing to reconcile yet.** DFFL's site checks its computed standings against Sleeper's
  official ones and matches on all twelve teams. C Cubed has no standings to check. That test is
  stubbed as a TODO at the bottom of `verify.mjs` and should be filled in the week it plays a game.
- **Load time.** The page makes about a dozen requests to Sleeper on load today, and will grow by
  roughly one per week per season as history accumulates. Expect it to stay under a second until
  the season is well under way.
- **Rate limits.** Sleeper allows about 1000 calls per minute per IP; a normal visit uses far
  fewer. If it ever trips, the page shows a clear error rather than a blank screen.
- **Nothing is cached.** Deliberate — stale fantasy stats are worse than a slow load. The site's
  own JSON is fetched with `no-cache` so a freshly published recap is never ten minutes stale.

## Local development

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

`verify.mjs` is the test harness (Node + Playwright). It serves the site, drives it in real
Chromium against the live league, and asserts the league loads as configured, that no keeper
machinery survives, that the odds arithmetic is coherent and deterministic, that the simulator
obeys this league's actual format, that the co-owned names render, that the borrowed calibration
is disclosed rather than hidden, that no DFFL content leaked in, and that nothing overflows at
390px on any section.

```bash
npm install
node verify.mjs        # ~700 checks; see below for the ones that cannot pass in season one
node verify.mjs --headed   # watch it drive
```

The harness was ported from the sibling site's (keeper checks removed, redraft checks added). Some
of its checks assume several seasons of history, a pre-draft board or a specific article; those
fail honestly here and are listed in the port report. Each group runs in isolation, so one group
that cannot apply fails as one named check instead of stopping the run. The last group sweeps
every shipped file for another league's id, a `dffl` URL or any email address.

## Data files and the weekly workflow

`.github/workflows/weekly-data.yml` reads Sleeper (league `1387595114829864960` only), ESPN's
injury feed and the published page, and commits plain JSON: `data/week-*.json`,
`data/latest.json`, `data/pulse.json`, `data/odds-snapshot.json`, `data/odds-history.json`,
`rosters.json`, `injuries.json`. It needs no secrets beyond the default `GITHUB_TOKEN` (with
`contents: write`) and sends no email. It only runs in `drewkim623-hash/ccubed`.

The email scripts (`compose-email.mjs`, `email-week.mjs`, `blast-status.mjs`, `recap-guard.mjs`,
`poll-tally.mjs`) only build or check files; none of them sends anything. **TODO (Drew):** there is
no C Cubed recipient list. `poll-tally.mjs` has an empty `LEAGUE` list and
`data/sent-emails.json` is an empty ledger. Nothing should be emailed until a C Cubed list is
written down.
