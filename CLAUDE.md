# Swiss Triangle Calculator

Visualizes how Swiss pairings and draws affect round-by-round standings for Magic: The Gathering events.

## Tech

Single-page HTML + vanilla JS + Bulma 1.0.2 CDN. No build step, no dependencies to install.

## File Structure

```
docs/
  index.html   — HTML shell (Bulma CDN, loads swiss.js)
  swiss.js     — All calculation + rendering logic
  test.html    — Test page (loads swiss.js, runs assertions)
CLAUDE.md
```

## How to Run

Open `docs/index.html` in any browser.

## How to Test

Open `docs/test.html` in any browser. All assertions are shown inline — green = pass, red = fail.

## Deployment

GitHub Pages, serving from the `docs/` directory of the `main` branch.
