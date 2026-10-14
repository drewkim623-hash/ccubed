# The weekly job

`recaps.json` and `rankings.json` are not written by the site. They are written by three scheduled
cloud agents — Claude routines at https://claude.ai/code/routines — whose exact prompts and
schedules are in [`ROUTINES.md`](ROUTINES.md). This file is the contract all three work to. Each
routine's prompt tells it to read this file first.

## The week's three pieces

Every week the league gets two or three articles — the Tuesday and Saturday pieces always, the
story watch's piece when the week has one:

| When (ET) | Routine | The piece | `source` |
|---|---|---|---|
| Tuesday 8:00 AM | C Cubed Tuesday recap | **the recap and a column in one article**: an argument off the finished week up top, then every game in full; plus the week's `weeks[]` entry and `rankings.json` | `"tuesday"` |
| Daily 9:00 AM, except Tuesday | C Cubed story watch | **at most one** piece per fantasy week (Wednesday through Monday, counted from the most recent Tuesday), never two: a big trade or a waiver splurge on any day but Tuesday, or the week's preview on Friday only. Tuesday is the recap's day; the watch writes nothing then | `"watch"` |
| Saturday 10:00 AM | C Cubed Saturday odds | the Saturday column, off the site's own odds board | `"saturday"` |

Every routine pushes straight to `main`. None of them uses a session branch: a commit that is not on
`main` is not on the site, and a teaser or an email that links to it links to nothing.

The site never depends on either file. A missing, empty or stale `rankings.json` costs nothing: the
power rankings are computed in the browser from the game log, and each team falls back to showing
its record and points where a blurb would go.

## Why the job does not call Sleeper

It cannot. In an unattended cloud session WebFetch to `api.sleeper.app` wants a per-URL approval
nobody is there to give, and the sandbox's egress proxy rejects curl. Both routes are closed. So
the data arrives a different way:

- **`.github/workflows/weekly-data.yml`** runs on GitHub Actions, which has no such restriction. It
  runs `build-week.mjs` and `build-injuries.mjs` at about 12:30 AM Eastern on Tuesday, refreshes
  `data/pulse.json` and the odds snapshot every morning at 7:00, and commits the result.
  `build-week.mjs` only moves `latest.json` once the week is truly over.
  `injury-returns.mjs` runs right after `build-injuries.mjs` (return dates from ESPN onto `injuries.json`,
  plus `injury-returns-cache.json`); it never fails the job, falling back to its cache if ESPN is down.
- **The routine** clones the repo and reads those committed files. It needs no network at all.

If the job ever finds itself reaching for `api.sleeper.app`, something has gone wrong: the answer is
to fix the Action, not to fetch.

## What the Action leaves for the job

| File | What it holds |
|---|---|
| `data/latest.json` | `{season, week, file}` — points at the newest finished week — plus `final`, `generated_at` (UTC) and `sleeper_state` (Sleeper's `week`, `leg`, `display_week`, `season_type`, `season` as read at `generated_at`). See **Which week** below |
| `data/week-<season>-<week>.json` | the whole week: six games with full lineups (every starter's points, the best bench player and `benchLeft`, the total points left on the bench), season-to-date standings, every completed transaction with FAAB and resolved player names, and a `marquee` block of the high, low, closest, blowout, shootout and unluckiest loss |
| `data/pulse.json` | the daily picture: standings, the week in progress, recent trades, waiver claims and free-agent moves, who is hurt |
| `data/odds-snapshot.json` | what the site's odds board shows: per team `playoffNow`, `titleNow`, projected `wins` and prices, plus each game's line. `playoffWas`/`titleWas` are the **preseason** numbers, not last week's |
| `data/odds-history.json` | every snapshot's reading, so a move since last week can be measured rather than guessed. Empty until the workflow has recorded one; while it is empty there is no line to quote and no move to measure |
| `injuries.json` | every player carrying a status, with name, position, club, body part and, often, a note |

Everything is already resolved to names. No ids need looking up, and nothing needs a second source.

One catch in the week file: if `standings_through_week` is less than `week`, the `standings` block
is behind the games above it: do not quote a record or points-for from it. The games themselves are
final and correct. Count earlier records from the earlier week files' games instead.

## What the job writes

The Tuesday routine writes three things; the other two write one article each. All of it is
committed straight to `main`.

1. **`recaps.json` → `weeks[]`** (Tuesday) — the week's full write-up.
2. **`rankings.json` → `weeks[]`** (Tuesday) — one sentence of colour per manager.
3. **`recaps.json` → `articles[]`** (every routine) — one new article, with a teaser.
4. **`news/<slug>.html` and `img/og/<slug>.png`** (every routine) — the new article's link card,
   written by `node build-cards.mjs`. See **The link card** below.

Then it emails that article's teaser to Drew, and only to Drew. See **The self-email** below.

### The contract for `weeks[]`

```json
{"season":"2026","week":4,"note":"","lede":"…","games":[…6…],"around":[…3-6…]}
```

`games[]` entries are `{headline, winner, winner_points, loser, loser_points, body}`; `around[]`
entries are `{kind, headline, body}` with kind one of `trade, waivers, riser, slider, streak,
injury, race, note`. `winner`/`loser` are Sleeper display_names exactly; the points are numbers and
must match the week file to the hundredth. Replace a week that already exists rather than
duplicating it. Set `note` to `"Playoffs"` from week 15 on (15 = Round 1, 16 = Semifinals,
17 = Championship).

**Every week gets a full entry, every week.** A finished week with no `weeks[]` entry is a gap on
the News tab that nothing else fills. The entry is the same shape and length as the reference
recaps this contract was modelled on (see **How long** below): a lede, all six games, and a
notebook of three to six items.

- **The lede** (80–120 words): one paragraph on the shape of the week — the week's total against
  earlier weeks, the high and the low, the closest and the widest, what changed at the top and the
  bottom of the standings, and the one transaction that mattered.
- **Each game** (a short headline, then 50–65 words, 2–4 sentences): how it was actually decided —
  the margin, who carried the scoring with their points, the starter who sank it or the bench
  points that would have changed it, and both records afterwards when they changed something.
- **The notebook** (`around[]`, 40–60 words each): only the items the week supports — a trade (who
  got what and what each side started since), waiver spending (FAAB is real money: a $40 claim is a
  story; a week where nobody paid is a fact too), an injury to a starter that cost points, a note
  on a strange lineup, and the race (records at the top and bottom, and the odds board where it
  says something the records do not). A quiet week gets three; a week with a trade and a $60 claim
  gets six. Never repeat in the notebook what a game recap already said.

`rankings.json` entries are `{"manager": "<Sleeper display_name, spelled exactly>", "blurb": "…"}`,
all twelve managers, every week. The site matches on that string and falls back silently if it does
not match.

### The Tuesday article

One article, appended to `articles[]`, that is both the column and the recap — the shape of
*Four Teams at 4-1, and a Gap Behind Them* (week 5):

- **The column first.** An argument the finished week supports and the standings alone do not
  show: a lead paragraph (`lead: true`), a `stat` block, two or three `h` sections of one to three
  paragraphs each, and a `bars` or `cards` block. Topics that carry a Tuesday column: how close or
  wide the week ran against every earlier week, a score that lost or won against the odds of it,
  points left on a bench, a trade or claim showing up on the scoreboard, and what the site's odds
  board says that the records do not. Read every headline and dek already in `articles[]` and do
  not repeat an angle — in particular, not the previous Saturday's.
- **Then "The Week in Full".** An `h` with eyebrow `every game`, a short paragraph on the slate
  (the total, how many were close, how many were not), then every game in order of how close it
  finished: an `h` per game with eyebrow `the closest`, `the second-closest`, … `the
  second-widest`, `the widest`, and one or two paragraphs, the first opening with the score in
  `<b>` (`<b>winner 127.28, loser 125.50.</b>`).
- End with a `note` block saying where the numbers come from and that nobody is quoted.
- Fields: unique `slug` (lowercase, hyphens), today's `date`, `season`, `kind: "opinion"`, `kicker`
  `"<season> · week <n>"` exactly (the recap guard matches on it), `headline`, `dek`,
  `byline: "C Cubed desk"`, `standfirst` (`"6 games · <total> points · <the week's hook>"`),
  `"source": "tuesday"`, `blocks` and `teaser`.

### The midweek and Saturday pieces

- **The story watch** writes one of: a **big-trade piece** (any completed trade in `pulse.json`
  `trades[]` that `articles[]` has not covered — who got what, what each side has started since,
  what the odds board says about both teams now); a **waivers piece** (a FAAB claim of $25 or
  more, or the week's biggest spending); or, if neither and only on a Friday, the **preview**: every
  game of the coming week with the site's line from `data/odds-snapshot.json` `games`, and what each
  game is worth to the playoff odds. It runs daily at 9:00 AM ET but never files on a Tuesday, and
  files at most one piece per fantasy week: if `articles[]` already has a `"source": "watch"` piece
  dated after the most recent Tuesday (America/New_York), it stops. On a day with no trade or
  waivers story that is not a Friday, it files nothing. Its `date` is that day's Eastern date; its
  `kind` is `"preview"` for the preview and `"opinion"` otherwise. A trade or waivers piece is a short column: lead paragraph, `stat`, two or
  three `h` sections, `cards` or `bars`. The preview runs like "The Week in Full": a lead
  paragraph, a `stat`, a `cards` block of the lines, an `h` per game with two or three paragraphs,
  a `bars` block and a `note`.
- **The Saturday column** argues from the odds board: who moved since last Saturday
  (`data/odds-history.json`), whose record and odds disagree, what the coming week's lines say. A
  lead paragraph, a `stat`, two `h` sections, a `bars` or `cards` block, and a `note`.

### How long

Measured on the reference league's 2026 pieces, which these are modelled on. Hit the target; stay
inside the range. `node check-recaps.mjs` fails a `weeks[]` entry or a Tuesday article outside it.

| Piece | Target | Range | Blocks |
|---|---|---|---|
| `weeks[]` entry (lede + six games + notebook) | ~750 words | 600–950 | lede ~100, six games ~55–60 each, 3–6 notebook items ~45 each |
| Tuesday article | ~1,100 words | 850–1,500 | 25–35 |
| Story watch: trade or waivers piece | ~400 words | 225–650 | 7–17 |
| Story watch: the preview | ~1,150 words | 900–1,300 | ~30 |
| Saturday column | ~475 words | 425–525 | 8–12 |

Never pad to reach a number. If the week does not support the length, the shorter piece is right
and the extra words are wrong — but a full `weeks[]` entry and a full Tuesday article always have
six games to write about.

### Blocks, links and images

The block model is in the file's own `_schema`. Only `<b>` survives in paragraph text; everything
else is escaped on the way to the page. In `bars` rows and `cards` titles put the bare display_name:
the site turns it into the full team label itself.

An `img` block (`{type:"img", src, alt, width, height, caption, href, link}`) shows an image
committed under `img/` in this repo, with alt text that says what it shows; `href`/`link` put a link
under it, such as `https://drewkim623-hash.github.io/ccubed/#picture`. Use it only for an image that
is already committed; a routine cannot take a screenshot.

If an article is ever rewritten under a new slug, keep the old slug in its `aliases` array so every
link already shared still opens it.

**Never drop `articles[]` or `weeks[]` when rewriting `recaps.json`.** Read the file, append to it,
and leave every existing article and week exactly as found. Dropping the key deletes writing nothing
else regenerates.

### The teaser

Every article carries a `teaser`: the text somebody copies from the article page (there is a
**Copy teaser** button) and pastes into the league group chat, and the body of the self-email.
Plain text, **600 characters at most**, no HTML or markdown, and exactly these ten lines,
separated by `\n` (breaking-news style):

```
🚨 C CUBED | WEEK n
(blank line)
HEADLINE IN CAPS
(blank line)
<emoji> stat line 1
<emoji> stat line 2
<emoji> stat line 3
(blank line)
Full story 👇
https://drewkim623-hash.github.io/ccubed/news/<slug>.html
```

- Line 1: `🚨 C CUBED | WEEK n` with the week the piece is about (`🚨 C CUBED | PRESEASON` before week 1).
- Line 3: the article's `headline`, exactly, in capitals.
- Lines 5-7: each opens with one emoji and a space, and each carries at least one number. **Every
  number on these lines must be printed in the article itself**, the same figure: the most
  surprising true numbers in it, with the names involved.
- Line 9: exactly `Full story 👇`.
- Line 10: exactly `https://drewkim623-hash.github.io/ccubed/news/<slug>.html` with the article's
  own slug: the link card page, which unfurls with a picture and then opens `#news/<slug>`.

Same rules as the article: no rank or movement, no invented stat, no quote.
`node check-recaps.mjs` fails a teaser out of this shape, over 600 characters, or with a number the
article does not print.

### The link card

After the article is in `recaps.json`, run:

```
node build-cards.mjs
```

It is free and local (Playwright, already in `package.json`). For every article it writes
`news/<slug>.html`, a static page with `og:` and `twitter:` tags (absolute URLs under
`https://drewkim623-hash.github.io/ccubed/`) that sends the reader on to `../#news/<slug>`, and
`img/og/<slug>.png`, the 1200x630 picture a pasted link shows. It only rewrites files whose bytes
change. **Commit `news/<slug>.html` and `img/og/<slug>.png` with the article**, in the same push:
without them the teaser's link is a 404. Never hand-edit either file.

## The two hard rules

**Never state a rank or a movement.** Not in the lede, a game recap, the notebook, a power blurb, an
article or a teaser. The site computes the power rankings itself and prints each team's rank and
its movement arrow beside the copy. If the prose says "up three spots" and the board says two, the
page is wrong in public. Write what happened; the board handles position. (An odds percentage from
`odds-snapshot.json` is a number, not a rank, and may be quoted.)

**Never invent a stat.** Everything in the data files is real and sourced. Anything not in them is
not available: no quotes, no history before 2026, no line that `odds-history.json` does not hold.

## The self-email

**After a routine pushes a new article to `main`, it emails that article to Drew — and only to
Drew.** It uses Drew's Gmail connector to send exactly **one** email per new article:

- **To:** `drewkim623@gmail.com` — this one address, hard-coded. No other recipient, ever.
- **No cc. No bcc.** No second address in any field.
- **Subject:** `C Cubed: <headline>` — the article's `headline`, exactly as committed.
- **Body:** the article's `teaser`, exactly as committed, as plain text — the ten-line
  breaking-news teaser above, ending in the card link. Nothing added, nothing removed, no signature.

Send only after `git push` has succeeded and the commit is on `origin/main`, so the link in the
teaser already works. A run that files no article sends nothing. If the send fails, say so in the
final message; do not retry more than once and do not try another address or another tool.

**This self-email is the only send allowed.** Every other no-send rule stands: nothing goes to the
league or to any other address, nothing is replied to, forwarded or drafted to anyone else, and
nothing is posted or messaged anywhere. C Cubed has no mailing list, no polls, no blasts and no
record of sends to keep. The league hears about an article because somebody pastes its teaser into
the group chat.

## Which week: check before a new recap

Before writing a recap the league has not had yet, run:

```
node recap-guard.mjs
```

It is read-only. A new recap is written only if all four hold:

1. `latest.json` has `"final": true` — every NFL game that week is complete and every league
   matchup has points.
2. Sleeper's week as recorded in `latest.json` (`sleeper_state.week`) is `latest.week + 1`, or is
   still `latest.week` while `final` is true (Sleeper advances its week hours after Monday night).
3. `generated_at` in `latest.json` is less than 12 hours old. Use that field, not the file's date:
   modification times in a git checkout mean nothing.
4. `recaps.json` has neither a `weeks[]` entry for that week nor a `"tuesday"` article whose kicker
   names it.

Exit **0**: go ahead. Exit **1**: **write no recap**, commit nothing, send nothing, and say in your
final message which condition failed (the script prints it). Do not work around it: no hand edits to
`latest.json`, no reaching for Sleeper. The story watch and Saturday routines do not write recaps
and do not need this check.

## Nothing checks the numbers but you

There is no second pair of eyes between a wrong number and the page. **Any ordinal or count must be
checked against a sorted list, not recalled.** "The second-highest score", "three of the six
winners", "the most points left on a bench" — those are the claims that slip past every numeric
check. Sort the list and look. If a figure cannot be traced to a file in this repo, it does not go
in the article, the recap or the teaser.

Before committing, save the old file and run the checker:

```
git show HEAD:recaps.json > /tmp/was.json
node check-recaps.mjs --was /tmp/was.json
```

It fails on a missing or broken teaser, a lost article, a `weeks[]` entry out of shape or out of
length, a score that does not match the week file, a Tuesday article outside its length, and a
missing or wrong link card (`news/<slug>.html`, `img/og/<slug>.png`). Fix everything it reports
until it exits 0.

## C Cubed, the facts

C Cubed is a 12-team full-PPR **redraft** league — no keepers, it drafts from scratch every year.
Three divisions: cville, chaps, tech. Playoffs start week 15 with 6 teams; the top two seeds get a
bye. Last place is decided by a toilet bowl in which you advance by LOSING.

2026 is the league's **first season**. There is no defending champion, no history, no rivalries and
no "last year" to refer to — do not invent any. "The season so far" is the only history there is.

Every team is run by two people (as Sleeper's co-owners read in October 2026). `manager` in the JSON
must always be the primary owner's Sleeper display_name, spelled exactly as the API returns it.

**Naming a team for a reader** follows the site's own label (`teamNameText` in `index.html`): the
Sleeper team name where one is set, otherwise both managers joined with " & " (e.g. "andychoe03 &
NathKim"). Use that form in a teaser and the first time a team appears in an article or a lede —
with the display_name after a named team, e.g. "Lucky Strike (drewkim)" — and the primary
display_name after that. Team names change, so take them from the `team` field of the newest data
files, never from the list below.

Teams (primary owner / co-owner / division):
  drewkim / riadmammadov (cville)
  andychoe03 / NathKim (cville)
  asierbelay / brandonleeickholt (cville)
  bigmoneyjos / CDAC4 (cville)
  yojarshh / Jopesii (chaps)
  nikhil1123 / WinDonator (chaps)
  saiky7 / eddycj (chaps)
  jjnhwg / dlee940 (chaps)
  edyun1 / silkysong (tech)
  jiddyyyyyy / ethanmdo (tech)
  Lee284 / jcseo17 (tech)
  tonypng / haydenwon (tech)

## Voice

Straight ESPN, a beat writer's Tuesday morning: clean, factual, specific. Not trash talk, not jokes.
Reference managers by their Sleeper `display_name` after the first mention. The lede is one
paragraph on the shape of the week. Game bodies are 2-4 sentences on how it was actually decided —
the margin, who carried the scoring, whether it was close. Notebook items are 2-3 sentences each,
only the ones the week supports. Put the number in the sentence (Jahmyr Gibbs's 37.7, a 1.78-point
margin), never "a big game". Never pad. FAAB is real money in this league: a $40 claim is a story.

## Editing the routines

The routines live at https://claude.ai/code/routines. Edit a prompt in the web UI rather than
through the API: the stored config carries a large `custom_system_prompt` and an explicit tool
allow-list, and an API update that omits `session_context` replaces both with defaults.
