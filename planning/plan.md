# Swiss Triangle Calculator - Implementation Plan

## Context

Educational tool for Magic: The Gathering event staff to visualize how Swiss tournament pairings work, specifically how unintentional draws in early rounds ripple through future round pairings. Deployed on GitHub Pages (`docs/` directory) for other store owners to discover and use.

## Files to Create

1. **`docs/index.html`** — Single-page app (Bulma CDN + vanilla JS, all in one file)
2. **`CLAUDE.md`** — Minimal project guidelines

## UI Layout (single column, centered, max ~900px)

### Section 1: Hero

- Title: "Swiss Triangle Calculator"
- Subtitle: brief one-liner explaining purpose

### Section 2: Input Form (Bulma box)

- **Players** — number input (default 8)
- **Rounds** — number input, auto-calculated as `ceil(log2(players))` but editable
- **Byes** — grouped inputs for players with 1, 2, 3 byes (default 0 each)
- **Generate** button — builds/rebuilds the triangle

### Section 3: Triangle Table (Bulma table)

- Columns: Score label, then one column per round (R0 through RN)
- Rows: descending score (top = max, bottom = 0), half-point rows appear only when draws exist
- Cells: player count at that score after that round
- Color intensity: cells shaded proportionally to player count (light background, never obscuring text)
- Empty cells left blank (not "0")
- Score labels: show points (e.g., "3", "2.5", "2"...) — generic scoring (1 per win, 0.5 per draw, 0 per loss)

### Section 4: Draw & Paired-Down Controls

Collapsible panels per round (Bulma `message` components), **expanded by default**:

For each round:
- Show each score group that has pairings in that round
- Display: "Score X (N players, M games)"
- **Draws input**: number input (0 to M) — how many of those games drew
- **Paired-down indicator**: when a score group has odd players, show which group the extra player pairs down into, with a toggle for the result (Win / Loss / Draw for the higher-scored player). Default: higher-scored player wins.

Changes trigger **immediate recalculation** — no submit button needed for draw controls.

### Section 5: Footer

- Brief "How to read this" explanation (2-3 sentences)
- Link to repo

## Scoring System

- **Win = 1 point, Draw = 0.5, Loss = 0** (generic, not MTG match points)
- Keeps the triangle clean and universally applicable
- MTG staff can mentally translate: 1 win = 3 match points

## Bye Logic

- **Byes = full point (1.0)** — standard for MTG
- Players with N byes receive automatic wins in rounds 1 through N
- They don't participate in the pairing pool for their bye rounds
- This reduces the active player count in those rounds

## Triangle Calculation Algorithm

### Step 1: Initialize

- Round 0: all players at score 0

### Step 2: For each round R (1 to max_rounds)

1. Start with the score distribution from end of round R-1
2. Remove bye players for this round (add them back at score+1 after pairing)
3. Process score groups **top-down**:
   - For each group with count N:
     - If N is odd: 1 player carries down to next group (paired down)
     - Remaining even count: pair within group
     - Each game produces: 1 winner (score+1) or if drawn (score+0.5, score+0.5)
     - Decisive games = total_games - draws
   - Handle paired-down players joining lower groups
4. Add bye players back at score+1

### Step 3: Recalculate on any draw/paired-down change

- Only recalculate from the affected round forward
- Update table and controls for subsequent rounds (since group sizes change)

## Accessibility (WCAG)

- All inputs have `<label>` elements (not just placeholder text)
- Table uses `<th scope="col">` and `<th scope="row">`
- Color is not the only indicator — player counts are always shown as numbers
- Sufficient contrast ratios (Bulma defaults are generally good)
- `aria-live="polite"` on the triangle table container so screen readers announce updates
- Keyboard-navigable controls
- `lang="en"` on html element

## Verification

1. Open `docs/index.html` in browser
2. Enter 8 players, verify 3 rounds auto-calculated
3. Generate — should show classic 8-player triangle (1-3-3-1 final distribution)
4. Add 1 draw in round 1 — half-point rows should appear, future rounds should recalculate
5. Test with 6 players (odd pairing scenarios)
6. Test bye inputs — verify players are removed from early rounds correctly
7. Test keyboard navigation through all controls
