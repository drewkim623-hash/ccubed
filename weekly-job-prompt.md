# The weekly job

`recaps.json` and `rankings.json` are not written by the site. They are written by three scheduled
cloud agents — Claude routines at https://claude.ai/code/routines — whose exact prompts and
schedules are in [`ROUTINES.md`](ROUTINES.md). This file is the contract all three work to. Each
routine's prompt tells it to read this file first.

The site never depends on either file. A missing, empty or stale `rankings.json` costs nothing: the
power rankings are computed in the browser from the game log, and each team falls back to showing
its record and points where a blurb would go.

**Nothing is emailed, blasted, polled or sent.** C Cubed has no recipient list, no send ledger and no
poll. A routine's whole job is to write files and push them to `main`. People find the writing in
the News tab, or because somebody pasted an article's teaser into the group chat.

## The week's pieces

| When (ET) | Routine | The piece | `source` |
|---|---|---|---|
| Tuesday | C Cubed Tuesday recap | **the recap and a column in one article**: an argument off the finished week up top, then every game in full; plus `weeks[]` and `rankings.json` | `"tuesday"` |
| Thursday or Friday | C Cubed story watch | **one** midweek piece — never zero, never two: a big trade, a waiver splurge, or the week's preview with the lines. Thursday only for a genuine story; otherwise Friday files the preview | `"watch"` |
| Saturday | C Cubed Saturday odds | the Saturday column, off the site's own odds board | `"saturday"` |

Every routine pushes straight to `main`. A commit that is not on `main` is not on the site, and a
teaser that links to it links to nothing.

## Why the job does not call Sleeper

It cannot. In an unattended cloud session WebFetch to `api.sleeper.app` wants a per-URL approval
nobody is there to give, and the sandbox's egress proxy rejects curl. So the data arrives a
different way:

- **`.github/workflows/weekly-data.yml`** runs on GitHub Actions, which has no such restriction. It
  runs `build-week.mjs` and `build-injuries.mjs` at about 12:30 AM Eastern on Tuesday, refreshes
  `data/pulse.json` and the odds snapshot every morning at 7:00, and commits the result.
- **The routine** clones the repo and reads those committed files. It needs no network at all.

If the job ever finds itself reaching for `api.sleeper.app`, something has gone wrong: the answer is
to fix the Action, not to fetch.

## What the Action leaves for the job

| File | What it holds |
|---|---|
| `data/latest.json` | `{season, week, file}` — points at the newest finished week — plus `final`, `generated_at` (UTC) and `sleeper_state` |
| `data/week-<season>-<week>.json` | the whole week: six games with full lineups, season-to-date standings, every completed transaction with FAAB and resolved player names, and a `marquee` block of the high, low, closest, blowout and unluckiest loss |
| `data/pulse.json` | the daily picture: standings, the week in progress, recent trades, waiver claims and free-agent moves, who is hurt |
| `data/odds-snapshot.json` | what the site's odds board shows: per team `playoffNow`, `titleNow`, projected `wins` and prices, plus each game's line. `playoffWas`/`titleWas` are the **preseason** numbers, not last week's |
| `data/odds-history.json` | every snapshot's reading, so a move since last week can be measured rather than guessed |
| `injuries.json` | every player carrying a status, with name, position and club |

Everything is already resolved to names. If `standings_through_week` in a week file is less than
`week`, the `standings` block is behind the games above it: do not quote a record from it.

## What the job writes

### `weeks[]` (Tuesday only)

```json
{"season":"2026","week":4,"note":"","lede":"…","games":[…6…],"around":[…3-6…]}
```

`games[]` entries are `{headline, winner, winner_points, loser, loser_points, body}`; `around[]`
entries are `{kind, headline, body}` with kind one of `trade, waivers, riser, slider, streak,
injury, race, note`. Replace a week that already exists rather than duplicating it. Set `note` to
`"Playoffs"` from week 15 on (15 = Round 1, 16 = Semifinals, 17 = Championship).

### `rankings.json` (Tuesday only)

`{"season":"2026","week":N,"teams":[{"manager":"<Sleeper display_name, spelled exactly>","blurb":"…"}]}`,
all twelve managers, every week. The site matches on that string and falls back silently if it does
not match. Same replace-don't-duplicate rule.

### `articles[]` (every routine, one article each run)

The block model is in the file's own `_schema`. Only `<b>` survives in paragraph text; everything
else is escaped on the way to the page. Fields:

- unique `slug` (lowercase, hyphens, no week number needed), today's `date`, `season`
- `kind: "opinion"` if it argues (the index flags it as a column)
- `kicker` — Tuesday: `"<season> · week <n>"` exactly, which the recap guard matches on
- `headline`, `dek`, `byline: "C Cubed desk"`, `standfirst`, `source`, `blocks`
- **`teaser`** — required, see below

**The Tuesday article** is the column and the recap together. The column first: an argument the
finished week supports and the standings alone do not show — a lead paragraph, a `stat` block, two or
three `h` sections, a `bars` or `cards` block. Then **"The Week in Full"**: an `h` with eyebrow
`every game`, a short paragraph, then every game in order of how close it finished: an `h` per game
and one or two paragraphs, opening with the score in `<b>`. *The Trade Showed Up Right Away* (week 5)
is the model.

**The story watch** writes one of: a **big-trade piece** (any completed trade in `pulse.json`
`trades[]` that `articles[]` has not covered — who got what, what each side started since, what the
odds board says now); a **waivers piece** (a FAAB claim of $25 or more, or the week's biggest
spending); or, if neither, the **preview**: every game of the coming week with the site's line from
`data/odds-snapshot.json` `games`, and what each game is worth to the playoff odds.

**The Saturday column** argues from the odds board: who moved since last Saturday
(`data/odds-history.json`), whose record and odds disagree, what the coming week's lines say.

Read every headline and dek already in `articles[]` and do not repeat an angle — in particular, not
the previous piece's.

**Never drop `articles[]` when rewriting `recaps.json`.** Read the file, add to it, and leave every
existing article exactly as found.

### The teaser

Every article carries a `teaser`: the text somebody copies from the article page (there is a
**Copy teaser** button) and pastes into the league group chat. Plain text, **600 characters at
most**, no HTML or markdown, lines separated by `\n`:

1. a punchy headline (it may differ from the article's),
2. two or three lines that make someone tap — the most surprising true number, the name involved,
3. last line, exactly: `https://drewkim623-hash.github.io/ccubed/#news/<slug>` with the article's own slug.

Same rules as the article: no rank or movement, no invented stat, no quote.

## Which week: check before a new recap

Before writing a recap the league has not had yet, run:

```
node recap-guard.mjs
```

It is read-only. A new recap is written only if all four hold:

1. `latest.json` has `"final": true`.
2. Sleeper's week as recorded in `latest.json` (`sleeper_state.week`) is `latest.week + 1`, or is
   still `latest.week` while `final` is true (Sleeper advances its week hours after Monday night).
3. `generated_at` in `latest.json` is less than 12 hours old.
4. `recaps.json` has neither a `weeks[]` entry for that week nor a `"tuesday"` article whose kicker
   names it.

Exit **0**: go ahead. Exit **1**: **write no recap**, commit nothing, and say in your final message
which condition failed (the script prints it). Do not work around it: no hand edits to
`latest.json`, no reaching for Sleeper. The story watch and Saturday routines do not write recaps
and do not need this check.

## The two hard rules

**Never state a rank or a movement.** Not in the lede, a game recap, the notebook, a power blurb, an
article or a teaser. The site computes the power rankings itself and prints each team's rank and
its movement arrow beside the copy. If the prose says "up three spots" and the board says two, the
page is wrong in public. Write what happened; the board handles position. (An odds percentage from
`odds-snapshot.json` is a number, not a rank, and may be quoted.)

**Never invent a stat.** Everything in the data files is real and sourced. Anything not in them is
not available. **Any ordinal or count must be checked against a sorted list, not recalled** — "the
second-highest score", "three of the six winners". Sort the list and look.

## C Cubed, the facts

C Cubed is a 12-team full-PPR **redraft** league — no keepers, it drafts from scratch every year.
Three divisions: cville, chaps, tech. Playoffs start week 15 with 6 teams. Last place is decided by
a toilet bowl in which you advance by LOSING.

2026 is the league's **first season**. There is no defending champion, no history, no rivalries and
no "last year" to refer to — do not invent any. "The season so far" is the only history there is.

Every team is run by two people (as Sleeper's co-owners read in October 2026). `manager` in the JSON must always be the primary
owner's Sleeper display_name, spelled exactly as the API returns it. In prose you may name both.

Teams (primary owner / co-owner / team name where set):
  drewkim / riadmammadov — Lucky Strike (cville)
  andychoe03 / NathKim (cville)
  asierbelay / brandonleeickholt — AB x B (cville)
  bigmoneyjos / CDAC4 (cville)
  yojarshh / Jopesii — S2? #jtw #imwallin (chaps)
  nikhil1123 / WinDonator — n² (chaps)
  saiky7 / eddycj (chaps)
  jjnhwg / dlee940 (chaps)
  edyun1 / silkysong (tech)
  jiddyyyyyy / ethanmdo — Team Meta/Bloomberg (tech)
  Lee284 / jcseo17 (tech)
  tonypng / haydenwon (tech)

## Voice

Straight ESPN, a beat writer's Tuesday morning: clean, factual, specific. Not trash talk, not jokes.
Reference managers by their Sleeper `display_name`. Game bodies are 2-4 sentences on how it was
actually decided — the margin, who carried the scoring, whether it was close late. Notebook items
are 2-3 sentences each, only the ones the week supports. Never pad. FAAB is real money in this
league: a $40 claim is a story.

## Editing the routines

The routines live at https://claude.ai/code/routines. Edit a prompt in the web UI rather than
through the API: the stored config carries a large `custom_system_prompt` and an explicit tool
allow-list, and an API update that omits `session_context` replaces both with defaults.
