# The graphics standard

Every chart, card and table that goes into a C Cubed article answers to this page. Each article
contract in `weekly-job-prompt.md` points here. The odds graphic is the `tiers` block (tier cards):
see **The default odds graphic** at the end.

## The look

- **ESPN / broadcast.** A dark ground, a red accent, and bold condensed type: the look of the
  article teaser and its card. It should read like a lower-third on a Sunday broadcast, not a
  spreadsheet.
- **Tiers, not lists.** Group teams into tiers ("Locks", "Bubble", "Long shots"), never a raw list
  of twelve. The tier name says what the numbers mean.
- **Polished, not blocky.** Hairline rules and one accent colour. No heavy boxes, no rainbow fills,
  no borders on everything.
- **Phone first.** Most of the league reads on a phone. Names wrap onto a second line; they are
  never cut off with an ellipsis or hidden behind a scroll.
- **Minimal clutter.** One number per row that matters, and nothing a reader has to decode. If a
  label, legend or gridline does not change what somebody takes away, cut it.
- **Hero number first.** The number is the headline: big, and the first thing the eye lands on.

## The process

1. **Check at 390px first.** Open the piece at 390px wide before anything else. Nothing overflows,
   nothing is clipped, every name is whole.
2. **Make the main number stand out.** It should be the first thing the eye lands on in each row.
3. **Cut clutter.** Remove anything that is not doing work. Keep `sub` under the title short;
   method, sources and caveats belong in `note`, under the block.
4. **Compare against this page.** Go down the list above and fix what does not match.

## New graphic types

A graphic type the site has not printed before needs **two or three options**, shown side by side,
before one is picked. If nobody answers, pick the one that best fits this standard and keep going:
never hold a piece for a reply.

## The default odds graphic: `tiers`

Any article that charts playoff or title odds uses a `tiers` block, not `bars`, `cards` or a
hand-built list, unless there is a reason the piece cannot (say so in the commit). It renders tier
cards: one card per tier, then a row per team with its avatar and team label, a big Playoff %, a
thin bar, and optional record, seed, status and bye chance. The week 5 Tuesday article
(*Four Teams at 4-1, and a Gap Behind Them*) is the reference.

```json
{"type": "tiers", "kicker": "Week 5 · The playoff picture", "title": "Four locks, one line",
 "sub": "Big number: chance to make the playoffs.",
 "note": "Playoff % from the site's odds board after week 5. Six of twelve make it; the top two get a bye.",
 "cutAfter": "<display_name of the sixth seed>",
 "href": "https://drewkim623-hash.github.io/ccubed/#picture", "link": "See the live Playoff Picture",
 "tiers": [
   {"name": "Locks", "range": "85% or better", "rows": [
     {"team": "<Sleeper display_name>", "pct": 93.2, "rec": "4-1", "seed": 1, "status": "bye", "bye": 46}
   ]},
   {"name": "Bubble", "range": "25% to 85%", "rows": [ … ]}
 ]}
```

- `title` (required): the headline over the cards.
- `tiers[]` (required): each `{name, range?, rows[]}`; rows top to bottom within a tier. `name` is
  required; `range` ("85% or better") sits beside it.
- Row fields: `team` (a manager's Sleeper `display_name`, required; the site draws the avatar and
  full team label from it), `pct` (playoff chance, 0-100, required), `bye` (0-100), `seed` (an
  integer, each used once), `status` (`"bye"`, `"in"` or `"out"`), `rec` ("4-1").
- Optional block fields: `kicker` (the red line over the title), `sub` (the line under the title),
  `note` (the footnote: method, sources, caveats), `cutAfter` (the `team` of the row the dashed
  playoff line sits under), `href` (https or `#`) with `link` (its words).
- **Numbers.** Write the real value from the odds board; the site prints Playoff % to one decimal
  and Bye % as a whole number.
- **Long shots stay in.** Every team gets a row, even at 0.3%: the tier says what it means.

`node check-recaps.mjs` validates every `tiers` block (`tiersProblems`). Open `?tierdemo` on the
site to see a sample.
