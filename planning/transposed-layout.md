# Transposed Triangle Layout

## Current Layout (rounds across, records down)
```
Record | Start | R1 | R2 | R3
  3-0  |       |    |    |  1
  2-1  |       |    |  2 |  3
  1-2  |       |  4 |  4 |  3
  0-3  |   8   |  4 |  2 |  1
```

## Proposed Layout (rounds down, match points across)
```
          | 0 pts | 3 pts | 6 pts | 9 pts |
----------+-------+-------+-------+-------+
 Start    |   8   |       |       |       |
          |  0-0  |       |       |       |
----------+-------+-------+-------+-------+
 After R1 |   4   |   4   |       |       |
          |  0-1  |  1-0  |       |       |
----------+-------+-------+-------+-------+
 After R2 |   2   |   4   |   2   |       |
          |  0-2  |  1-1  |  2-0  |       |
----------+-------+-------+-------+-------+
 After R3 |   1   |   3   |   3   |   1   |
          |  0-3  |  1-2  |  2-1  |  3-0  |
----------+-------+-------+-------+-------+
```

The triangle shape is immediately visible — filled cells form a triangle expanding to the right.

## With Draws (1 draw in R1)

New match-point columns appear (1pt, 4pt, 7pt), visually showing how draws "expand" the triangle:

```
          | 0 pts | 1 pt  | 3 pts | 4 pts | 6 pts | 7 pts | 9 pts |
----------+-------+-------+-------+-------+-------+-------+-------+
 Start    |   8   |       |       |       |       |       |       |
          |  0-0  |       |       |       |       |       |       |
----------+-------+-------+-------+-------+-------+-------+-------+
 After R1 |   3   |   2   |   3   |       |       |       |       |
          |  0-1  | 0-0-1 |  1-0  |       |       |       |       |
----------+-------+-------+-------+-------+-------+-------+-------+
 After R2 |   ?   |   ?   |   ?   |   ?   |   ?   |       |       |
          |  ...  |  ...  |  ...  |  ...  |  ...  |       |       |
----------+-------+-------+-------+-------+-------+-------+-------+
 After R3 |   ?   |   ?   |   ?   |   ?   |   ?   |   ?   |   ?   |
          |  ...  |  ...  |  ...  |  ...  |  ...  |  ...  |  ...  |
```

## Cell Design

Each cell shows:
- **Count** (large, bold) — the number of players
- **Record** (smaller, below) — the W-L-D record

```
  ┌───────┐
  │   4   │  ← count, large
  │  1-0  │  ← record, smaller text
  └───────┘
```

When multiple records share the same match points (rare, e.g. 1-2 and 0-0-3 both at 3pts):
```
  ┌───────┐
  │ 3 1-2 │  ← each record on its own line
  │ 1 0-0-3│
  └───────┘
```

## Column Headers

Just match points: "0 pts", "1 pt", "3 pts", etc.

Only columns that have at least one player anywhere in the triangle are shown. Without draws, columns are 0, 3, 6, 9. With draws, intermediate columns (1, 2, 4, 5, 7, 8) appear as needed.

## Row Headers (sticky on mobile)

"Start", "After R1", "After R2", "After R3"

Sticky left column so the round label stays visible while scrolling horizontally on mobile.

## Why This Is Better

1. **Top-to-bottom = tournament progression** — matches how TOs think about rounds
2. **Triangle shape is literal** — filled cells expand right, forming a visible triangle
3. **Draws expand the triangle** — new columns appear, visually showing the "widening" effect
4. **Match-point columns = pairing groups** — each column header IS the group used for pairing
5. **Mobile-friendly** — horizontal scroll shows higher match points, round labels stay pinned

## Implementation Changes

- `renderTriangle()` needs to be rewritten:
  - Collect all match-point values that appear across all rounds
  - Sort columns by match points ascending (0 on left, max on right)
  - For each round (row), for each match-point column, show the count and record(s)
  - Group multiple records in same match-point cell (stack vertically)
- Column headers: just match point values
- Row headers: "Start", "After R1", etc.
- Sticky first column remains (now it's the round label)
- Color shading logic stays the same (proportional to count)
