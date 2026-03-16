# Swiss Triangle Calculator - Implementation Plan

## Context

Educational tool for Magic: The Gathering event staff to visualize how Swiss tournament pairings work, specifically how unintentional draws in early rounds ripple through future round pairings. Also useful for estimating prize payouts (e.g., "I'd expect 5 people at 3-0"). Deployed on GitHub Pages (`docs/` directory) for other store owners to discover and use.

## Files to Create

1. **`docs/index.html`** — Single-page app (Bulma CDN, loads swiss.js)
2. **`docs/swiss.js`** — All calculation and rendering logic (separated for testability)
3. **`docs/test.html`** — Simple test page that loads swiss.js and runs assertions
4. **`CLAUDE.md`** — Minimal project guidelines

## UI Layout (single column, centered, max ~900px, mobile-first)

### Section 1: Hero

- Title: "Swiss Triangle Calculator"
- Subtitle: "Visualize how Swiss pairings and draws affect round-by-round standings"

### Section 2: Input Form (Bulma box)

- **Players** — number input (default 8, min 4)
- **Rounds** — number input, auto-calculated as `ceil(log2(players))` but editable. Auto-calc uses `change` event (not `input`) to avoid flickering while typing.
- **Byes** — grouped inputs for players with 1, 2, 3 byes (default 0 each). Labels: "1-Round Bye", "2-Round Bye", "3-Round Bye"
- **Generate** button — builds/rebuilds the triangle, clears draw state

### Section 3: How to Read (brief note above triangle)

- 2-3 sentences explaining: rows = records, columns = rounds, cells = player counts

### Section 4: Triangle Table (Bulma table)

- **Rows**: Possible records (W-L-D format), sorted by match points descending
  - e.g., for 3 rounds no draws: 3-0 (9pts), 2-1 (6pts), 1-2 (3pts), 0-3 (0pts)
  - With a draw: adds records like 2-0-1 (7pts), 1-1-1 (4pts), 0-2-1 (1pt)
  - Row label shows both record and match points: "2-1 (6 pts)"
  - D=0 records shown without the draw count: "2-1" not "2-1-0"
- **Columns**: "Start", "After R1", "After R2", ..., "After RN"
- **Cells**: Number of players with that record — always integers
- Color intensity: cells shaded proportionally to player count (minimum 10% opacity for visibility, max 40%)
- Empty cells left blank
- **Sticky first column** on mobile via `position: sticky; left: 0` so record labels stay visible during horizontal scroll
- Wrapped in `table-container` for mobile horizontal scroll

### Section 5: Draw & Paired-Down Controls

Collapsible panels per round (Bulma `message` components), **expanded by default**, with working toggle buttons (`aria-expanded`, keyboard accessible via Enter/Space):

For each round:
- Show each match-point group that has pairings in that round
- Display: "X match points (N players, M games)"
- **Draws input**: number input (0 to M) — how many of those games drew. No `is-small` — full-size for WCAG touch targets.
- **Paired-down indicator**: when a match-point group has odd players after within-group pairing, show which group the extra player pairs down into, with a toggle for the result (Win / Loss / Draw for the higher-standing player). Default: higher-standing player wins.

Changes trigger **immediate recalculation** via `change` event. A single `<span aria-live="polite">` announces "Triangle updated" rather than re-reading the entire table.

### Section 6: Footer

- Link to repo

## Scoring System

- **Win = 3 match points, Draw = 1, Loss = 0** (standard MTG)
- Records displayed as W-L-D (e.g., "2-1-0" or just "2-1" when D=0)
- Pairing groups are based on match points

## Bye Logic

- **Byes = match win (3 match points)** — standard for MTG
- Players with N byes receive automatic wins in rounds 1 through N
- They don't participate in the pairing pool for their bye rounds
- This reduces the active player count in those rounds
- Tracked by count subtraction from the distribution (bye players are always at the undefeated record for their round)

## Triangle Calculation Algorithm — Integer-Based

### Core Principle: Within-Record-First Pairing

To maintain integer player counts, the algorithm pairs players with identical records first. This guarantees integer results because splitting an even count of identical records always produces whole numbers.

### Step 1: Initialize

- Round 0: all players at record 0-0-0 (0 match points)

### Step 2: For each round R (1 to max_rounds)

1. Start with the record distribution from end of round R-1
2. Remove bye players for this round (they're at record (R-1)-0-0, add them back with +1 win after pairing)
3. Group remaining players by match points, process **top-down**:

   For each match-point group:
   a. Merge in any carry-down player from the higher group
   b. **Within-record pairing**: For each record in this group:
      - Count N players with this record
      - floor(N/2) games → floor(N/2) add a win, floor(N/2) add a loss
      - If N is odd: 1 leftover
   c. **Cross-record leftovers** (rare, requires draws in multiple rounds):
      - If 2+ leftovers exist within this group, pair them off
      - Default: higher-record player wins (deterministic, integer result)
      - If 1 leftover remains: carry down to next match-point group
   d. **Draws within this group**: The user-specified draw count is applied to within-record games. For each record subgroup, a proportional number of its games become draws. Since the draw count is per-group and the subgroup sizes are integers, we round draws to keep results integer (allocate draws to largest subgroup first).

4. Bottom carry-down (unpaired player): resolve based on paired-down config (win/loss/draw). Default: higher-standing player wins.
5. Add bye players back with +1 win to their record

### Draw Distribution Within a Group

When a group has D draws and multiple record subgroups with game counts [g1, g2, ...]:
- Allocate draws proportionally: subgroup i gets round(D * gi / total_games) draws
- Adjust rounding to ensure total allocated = D
- Each subgroup's draws: both players add a draw instead of win/loss
- Decisive games: one adds win, one adds loss

### Step 3: Recalculate on any draw/paired-down change

- Recalculate all rounds from round 1 (simpler than partial, fast enough for ≤10 rounds)
- Update table and draw controls
- Preserve user's draw/paired-down selections for rounds that still have matching groups

## Input Validation

- **All number inputs**: `min="0"` in HTML. JS clamps with `Math.max(0, value)`.
- **Players**: minimum 4. JS clamps to 4 if lower.
- **Byes total**: if `byes1 + byes2 + byes3 > players`, show `is-danger` help text: "Total byes exceed player count." Don't block generation — just warn.
- **Draw counts**: max = games in that group (enforced by `max` attribute and JS clamp).
- No aggressive blocking — clamp silently for obvious cases, warn for ambiguous ones.

## Accessibility (WCAG)

- All inputs have `<label>` elements with matching `for`/`id` attributes (including dynamically generated draw/paired-down controls)
- Table uses `<th scope="col">` and `<th scope="row">`, plus `aria-label` on the table element
- Color is not the only indicator — player counts are always shown as numbers
- Cell shading minimum opacity 10% to be perceptible
- Single `<span aria-live="polite">` for recalculation announcements (not on the entire table/controls)
- Collapse toggles: `<button>` elements with `aria-expanded`, keyboard accessible (Enter/Space)
- Full-size inputs in draw controls (no `is-small`) for 44px+ touch targets
- `lang="en"` on html element

## Mobile

- `<meta name="viewport" content="width=device-width, initial-scale=1">`
- `table-container` for horizontal scroll on narrow screens
- Sticky first column (record labels) via CSS `position: sticky; left: 0; z-index: 1`
- `columns is-mobile is-multiline` for input form
- Bye inputs: 3 columns on mobile is tight — if too cramped, break to `is-half-mobile` and wrap
- All inputs full-size (not `is-small`) for touch targets
- `change` event (not `input`) on player count to avoid rounds field flickering while typing

## Execution TODO

- [ ] 1. Create `CLAUDE.md` with project guidelines
- [ ] 2. Create `docs/` directory
- [ ] 3. Build `docs/index.html` — HTML structure with Bulma CDN, all sections, loads swiss.js
- [ ] 4. Build `docs/swiss.js` — scaffold with state, record utilities, empty function stubs
- [ ] 5. Implement input form logic — read inputs, validation, auto-calc rounds, generate button
- [ ] 6. Implement core triangle calculation engine (no draws) — within-record-first pairing, integer results
- [ ] 7. Implement triangle table rendering — Bulma table with sticky first column, color shading
- [ ] 8. Implement draw controls UI — per-round collapsible panels, per-group draw inputs, toggle buttons
- [ ] 9. Implement draw logic — recalculate triangle when draws are modified, new record rows appear
- [ ] 10. Implement paired-down logic — detect odd groups, resolve carry-down based on user selection
- [ ] 11. Accessibility pass — for/id on dynamic elements, aria-live, aria-expanded, keyboard nav
- [ ] 12. Build `docs/test.html` — test cases for core calculation functions
- [ ] 13. Manual verification — test with 8 players, 6 players, 20 players, draws, byes

## Verification

1. Open `docs/index.html` in browser
2. Enter 8 players, verify 3 rounds auto-calculated
3. Generate — should show 1-3-3-1 distribution (3-0:1, 2-1:3, 1-2:3, 0-3:1) — all integers
4. Add 1 draw in round 1 — draw records appear (e.g., 0-0-1), future rounds recalculate, still all integers
5. Test with 6 players — verify paired-down controls appear for odd groups
6. Toggle paired-down to "Higher-standing loses" — verify distribution changes
7. Test bye inputs — verify players removed from early rounds
8. Enter byes > players — verify warning appears
9. Open `docs/test.html` — all assertions pass
10. Test on mobile viewport (or device) — table scrolls, sticky column works, inputs are tappable
