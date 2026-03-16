# Swiss Triangle Calculator

A simple tool to visualize how Swiss tournament pairings work round by round. Built for Magic: The Gathering event staff to understand how draws and paired-down results affect standings and prize payouts.

**[Live Site](https://twentysidedstore.github.io/swiss-triangles/)**

![Swiss Triangle Calculator screenshot](screenshot.png)

## Features

- Configure player count, number of rounds, and byes (1/2/3 round)
- Triangle table shows player distribution by record after each round
- Add draws to any round and see how they ripple through future pairings
- Control paired-down results (win/loss/draw) with actual record labels
- Cascading pair-downs handled correctly (e.g., 8 players with a draw creates two pair-down decisions)
- All player counts are always integers
- Mobile-friendly with horizontal scroll and sticky round labels

## Run Locally

Open `docs/index.html` in any browser. No build step, no dependencies.

## Tests

Open `docs/test.html` in a browser to run the calculation test suite.
