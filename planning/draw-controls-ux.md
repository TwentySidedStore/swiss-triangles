# Draw Controls UX Fix

## Problems

1. **Drawn matches input vs paired-down select are visually confused.** Both live in the same block with similar labels. The paired-down select has a "Draw" option AND there's a separate "Draws" number input. User can't tell which does what.

2. **"Draws (max 1)" wraps to two lines** due to Bulma's `is-horizontal` field layout squeezing the label.

3. **No visual break** between match-point groups within a round panel. Everything runs together.

## Proposed Fix

### Reorder and separate the two controls

**Drawn matches first** (this is the primary feature of the tool), then paired-down second with clear visual separation.

### New layout for each match-point group

```
Round 2
────────────────────────────────────────────────

3 match points · 3 players · 1 game

  Drawn matches    [ 0 ]

  ⚠ Paired down: 1-0 vs 0-1
  Result           [ 1-0 player wins ▾ ]

────────────────────────────────────────────────

0 match points · 4 players (incl. pair-down) · 2 games

  Drawn matches    [ 0 ]

```

### Specific changes

1. **Group header**: Use `·` separated inline text instead of parentheses. Bolder.

2. **Drawn matches input**: Label is just "Drawn matches". Move the max hint to `<p class="help">` below the input: "Out of N games in this group". This avoids the line-break problem and adds context.

3. **Paired-down section**: Only appears when the group is odd. Visually indented or given a subtle background (Bulma `notification is-warning is-light` or just a left border). Shows the tag "Paired down: 1-0 vs 0-1" and the result select on its own line.

4. **`<hr>` between groups**: Simple Bulma `<hr>` between each match-point group within a round panel. Last group has no trailing `<hr>`.

5. **Label wrapping fix**: Don't use `is-horizontal` for the drawn matches field. Use a standard stacked field layout — label above, input below. This is simpler, more mobile-friendly, and avoids the wrapping issue entirely. The horizontal layout doesn't add value when there's only one input per row.

### Result

- The two concepts (drawn matches count vs paired-down result) are visually separated
- Labels are unambiguous: "Drawn matches" ≠ "Paired-down result"
- Max hint doesn't wrap
- Groups are clearly delineated
- More readable on mobile (stacked fields > horizontal fields)
