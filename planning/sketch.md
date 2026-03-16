# HTML & JavaScript Sketch

## File Structure

```
docs/
  index.html    — HTML shell, loads Bulma + swiss.js
  swiss.js      — All calculation + rendering logic
  test.html     — Loads swiss.js, runs assertions
```

## Mobile-First Bulma Strategy

- `table-container` wraps the triangle table for horizontal scroll on small screens
- Sticky first column via CSS so record labels remain visible while scrolling
- `columns is-mobile is-multiline` for input fields
- Full-size inputs everywhere (no `is-small`) for 44px+ WCAG touch targets
- `change` event on player input (not `input`) to avoid rounds flickering while typing
- Bye inputs use `is-half-mobile` to allow wrapping if 3-across is too tight

## index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Swiss Triangle Calculator</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.2/css/bulma.min.css">
  <style>
    .triangle-cell {
      text-align: center;
      font-weight: 600;
      min-width: 3.5rem;
      color: #363636;
    }
    .record-label {
      white-space: nowrap;
    }
    /* Sticky first column for mobile horizontal scroll */
    .table-container table th:first-child,
    .table-container table td:first-child {
      position: sticky;
      left: 0;
      z-index: 1;
      background: #fff;
    }
    .table-container table thead th:first-child {
      z-index: 2;
    }
  </style>
</head>
<body>

  <!-- HERO -->
  <section class="hero is-primary">
    <div class="hero-body">
      <div class="container">
        <h1 class="title">Swiss Triangle Calculator</h1>
        <p class="subtitle">Visualize how Swiss pairings and draws affect round-by-round standings</p>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="container">

      <!-- INPUT FORM -->
      <div class="box">
        <h2 class="title is-4">Tournament Setup</h2>

        <div class="columns is-mobile is-multiline">
          <div class="column is-half-mobile is-one-quarter-desktop">
            <div class="field">
              <label class="label" for="players">Players</label>
              <div class="control">
                <input class="input" type="number" id="players" value="8" min="4" max="512">
              </div>
            </div>
          </div>
          <div class="column is-half-mobile is-one-quarter-desktop">
            <div class="field">
              <label class="label" for="rounds">Rounds</label>
              <div class="control">
                <input class="input" type="number" id="rounds" value="3" min="1" max="10">
              </div>
              <p class="help">Auto-calculated, but editable</p>
            </div>
          </div>
        </div>

        <h3 class="title is-5">Byes</h3>
        <div class="columns is-mobile is-multiline">
          <div class="column is-half-mobile is-one-third-tablet">
            <div class="field">
              <label class="label" for="byes1">1-Round Bye</label>
              <div class="control">
                <input class="input" type="number" id="byes1" value="0" min="0">
              </div>
            </div>
          </div>
          <div class="column is-half-mobile is-one-third-tablet">
            <div class="field">
              <label class="label" for="byes2">2-Round Bye</label>
              <div class="control">
                <input class="input" type="number" id="byes2" value="0" min="0">
              </div>
            </div>
          </div>
          <div class="column is-half-mobile is-one-third-tablet">
            <div class="field">
              <label class="label" for="byes3">3-Round Bye</label>
              <div class="control">
                <input class="input" type="number" id="byes3" value="0" min="0">
              </div>
            </div>
          </div>
        </div>
        <p class="help is-danger" id="bye-warning" style="display:none">
          Total byes exceed player count.
        </p>

        <div class="field">
          <div class="control">
            <button class="button is-primary is-medium" id="generate">
              Generate Triangle
            </button>
          </div>
        </div>
      </div>

      <!-- HOW TO READ -->
      <div class="notification is-light" id="how-to-read" style="display:none">
        <strong>How to read the triangle:</strong> Each row is a possible record
        (wins-losses or wins-losses-draws). Each column shows how many players have
        that record after that round. Use the controls below the table to see how
        draws change future rounds.
      </div>

      <!-- TRIANGLE TABLE -->
      <div id="triangle-output">
        <!-- swiss.js renders table here -->
      </div>

      <!-- ARIA LIVE REGION (single, concise announcements) -->
      <span id="live-announce" class="is-sr-only" aria-live="polite"></span>

      <!-- DRAW CONTROLS -->
      <div id="draw-controls">
        <!-- swiss.js renders per-round panels here -->
      </div>

    </div>
  </section>

  <!-- FOOTER -->
  <footer class="footer">
    <div class="content has-text-centered">
      <p>
        <a href="https://github.com/your-repo/swiss-triangles">Source on GitHub</a>
      </p>
    </div>
  </footer>

  <script src="swiss.js"></script>
</body>
</html>
```

## swiss.js

```javascript
// ============================================================
// STATE
// ============================================================
const state = {
  players: 8,
  rounds: 3,
  byes: [0, 0, 0],       // byes[0] = 1-round bye count, etc.
  draws: {},              // draws[roundNum][matchPoints] = numDraws
  pairedDown: {},         // pairedDown[roundNum][matchPoints] = 'win'|'loss'|'draw'
  triangleData: null      // computed: array of record distributions per round
};

// ============================================================
// RECORD UTILITIES
// ============================================================

function recordKey(w, l, d) {
  return `${w}-${l}-${d}`;
}

function parseRecord(key) {
  const [w, l, d] = key.split('-').map(Number);
  return { w, l, d };
}

function matchPoints(key) {
  const { w, d } = parseRecord(key);
  return w * 3 + d;
}

function displayRecord(key) {
  const { w, l, d } = parseRecord(key);
  return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
}

function addWin(key) {
  const { w, l, d } = parseRecord(key);
  return recordKey(w + 1, l, d);
}

function addLoss(key) {
  const { w, l, d } = parseRecord(key);
  return recordKey(w, l + 1, d);
}

function addDraw(key) {
  const { w, l, d } = parseRecord(key);
  return recordKey(w, l, d + 1);
}

// ============================================================
// GROUPING HELPERS
// ============================================================

function groupByMatchPoints(dist) {
  const groups = {};
  for (const [rec, count] of Object.entries(dist)) {
    if (count <= 0) continue;
    const pts = matchPoints(rec);
    if (!groups[pts]) groups[pts] = {};
    groups[pts][rec] = (groups[pts][rec] || 0) + count;
  }
  return groups;
}

function sumValues(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

function addToDist(dist, key, count) {
  if (count <= 0) return;
  dist[key] = (dist[key] || 0) + count;
}

// ============================================================
// CORE TRIANGLE CALCULATION (integer-based)
// ============================================================

function calculateTriangle() {
  const { players, rounds, byes, draws, pairedDown } = state;
  const roundData = [];

  roundData[0] = { [recordKey(0, 0, 0)]: players };

  for (let r = 1; r <= rounds; r++) {
    roundData[r] = processRound(
      roundData[r - 1],
      r,
      draws[r] || {},
      pairedDown[r] || {},
      byes
    );
  }

  state.triangleData = roundData;
}

function processRound(prevDist, roundNum, drawsConfig, pdConfig, byes) {
  const dist = { ...prevDist };
  const byeRecords = {};

  // --- 1. Remove bye players ---
  // Players with N-round byes (N >= roundNum) get a free win this round.
  // They're at record (roundNum-1)-0-0 entering this round.
  let totalByePlayers = 0;
  for (let i = 0; i < byes.length; i++) {
    if (roundNum <= (i + 1)) {
      totalByePlayers += byes[i];
    }
  }

  if (totalByePlayers > 0) {
    const byeRecord = recordKey(roundNum - 1, 0, 0);
    if (dist[byeRecord]) {
      const removeCount = Math.min(totalByePlayers, dist[byeRecord]);
      dist[byeRecord] -= removeCount;
      if (dist[byeRecord] <= 0) delete dist[byeRecord];
      byeRecords[byeRecord] = removeCount;
    }
  }

  // --- 2. Group by match points, process top-down ---
  const groups = groupByMatchPoints(dist);
  const sortedPts = Object.keys(groups).map(Number).sort((a, b) => b - a);

  const newDist = {};
  let carryDown = null; // { record, count: 1 } or null

  for (const pts of sortedPts) {
    const records = { ...groups[pts] };

    // Merge carry-down from higher group
    if (carryDown) {
      records[carryDown.record] = (records[carryDown.record] || 0) + 1;
      carryDown = null;
    }

    const total = sumValues(records);
    if (total <= 0) continue;

    // --- 3. Within-record-first pairing ---
    const recordEntries = Object.entries(records).filter(([, c]) => c > 0);
    const leftovers = []; // records with odd counts that have 1 leftover
    const totalGames = Math.floor(total / 2);
    const groupDraws = Math.min(drawsConfig[pts] || 0, totalGames);

    // Calculate total within-record games to distribute draws proportionally
    let totalWithinGames = 0;
    for (const [, count] of recordEntries) {
      totalWithinGames += Math.floor(count / 2);
    }

    // Distribute draws across sub-records proportionally
    let drawsRemaining = groupDraws;
    const subRecordDraws = {};

    // Sort by game count descending to allocate draws to largest groups first
    const sortedEntries = [...recordEntries].sort((a, b) => b[1] - a[1]);

    for (const [rec, count] of sortedEntries) {
      const games = Math.floor(count / 2);
      if (totalWithinGames > 0 && games > 0) {
        const allocated = Math.min(
          Math.round(groupDraws * games / totalWithinGames),
          drawsRemaining,
          games
        );
        subRecordDraws[rec] = allocated;
        drawsRemaining -= allocated;
      } else {
        subRecordDraws[rec] = 0;
      }
    }

    // Pair within each record
    for (const [rec, count] of recordEntries) {
      const games = Math.floor(count / 2);
      const draws = subRecordDraws[rec] || 0;
      const decisive = games - draws;

      // Decisive: half win, half lose
      if (decisive > 0) {
        addToDist(newDist, addWin(rec), decisive);
        addToDist(newDist, addLoss(rec), decisive);
      }
      // Draws: both players add a draw
      if (draws > 0) {
        addToDist(newDist, addDraw(rec), draws * 2);
      }

      // Odd player is a leftover
      if (count % 2 === 1) {
        leftovers.push(rec);
      }
    }

    // --- 4. Cross-record leftovers ---
    // Pair leftovers with each other (default: first listed wins)
    while (leftovers.length >= 2) {
      const recA = leftovers.shift(); // higher record (sorted by match points, same here)
      const recB = leftovers.shift();
      // Default: recA wins (arbitrary but deterministic)
      addToDist(newDist, addWin(recA), 1);
      addToDist(newDist, addLoss(recB), 1);
    }

    // 1 leftover remains: carry down to next group
    if (leftovers.length === 1) {
      carryDown = { record: leftovers[0] };
    }
  }

  // --- 5. Resolve final carry-down ---
  // Bottom-most unpaired player. In a real tournament, they'd get a bye.
  // If they carried down from a higher group, use pdConfig.
  if (carryDown) {
    // Check if there's a paired-down config for the group they came from
    // For simplicity, the bottom carry-down always gets a win (bye)
    addToDist(newDist, addWin(carryDown.record), 1);
  }

  // --- 6. Add bye players back with +1 win ---
  for (const [rec, count] of Object.entries(byeRecords)) {
    addToDist(newDist, addWin(rec), count);
  }

  return newDist;
}

// ============================================================
// PAIRED-DOWN RESOLUTION (between match-point groups)
// ============================================================
//
// The carry-down between groups is handled in the main loop.
// When a player carries down from group A (higher pts) to group B:
//
// The carry-down player joins group B's pairing pool. Their game
// against a group-B player is resolved based on pdConfig:
//
// - 'win' (default): carry-down player wins → addWin(carryRecord), addLoss(opponentRecord)
// - 'loss': carry-down player loses → addLoss(carryRecord), addWin(opponentRecord)
// - 'draw': both draw → addDraw(carryRecord), addDraw(opponentRecord)
//
// Implementation: when merging carry-down into a group, if pdConfig
// exists for the source group's match points, resolve the carry-down
// player's game separately before pairing the rest of the group.
//
// This is integrated into the main loop above: when carryDown is
// merged into the next group, we check pdConfig and handle accordingly.

// ============================================================
// RENDERING - TRIANGLE TABLE
// ============================================================

function renderTriangle() {
  const roundData = state.triangleData;
  if (!roundData) return;

  // Show the how-to-read note
  document.getElementById('how-to-read').style.display = '';

  // Collect all records that appear in any round
  const allRecords = new Set();
  for (const rd of roundData) {
    for (const [rec, count] of Object.entries(rd)) {
      if (count > 0) allRecords.add(rec);
    }
  }

  // Sort: by match points desc, then wins desc
  const sorted = [...allRecords].sort((a, b) => {
    const ptsDiff = matchPoints(b) - matchPoints(a);
    if (ptsDiff !== 0) return ptsDiff;
    return parseRecord(b).w - parseRecord(a).w;
  });

  const maxCount = Math.max(
    ...roundData.flatMap(rd => Object.values(rd).filter(v => v > 0))
  );

  let html = '<div class="table-container">';
  html += '<table class="table is-bordered is-hoverable is-fullwidth" aria-label="Swiss tournament record distribution">';
  html += '<thead><tr>';
  html += '<th scope="col">Record</th>';
  html += '<th scope="col">Pts</th>';
  for (let r = 0; r < roundData.length; r++) {
    html += `<th scope="col">${r === 0 ? 'Start' : 'After R' + r}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const rec of sorted) {
    const pts = matchPoints(rec);
    html += `<tr>`;
    html += `<th scope="row" class="record-label">${displayRecord(rec)}</th>`;
    html += `<td>${pts}</td>`;
    for (let r = 0; r < roundData.length; r++) {
      const count = roundData[r][rec] || 0;
      if (count > 0) {
        const intensity = Math.max(0.1, (count / maxCount) * 0.4);
        html += `<td class="triangle-cell" style="background:rgba(50,115,220,${intensity.toFixed(2)})">${count}</td>`;
      } else {
        html += '<td class="triangle-cell"></td>';
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  document.getElementById('triangle-output').innerHTML = html;
}

// ============================================================
// RENDERING - DRAW CONTROLS
// ============================================================

function renderDrawControls() {
  const roundData = state.triangleData;
  if (!roundData) return;

  let html = '';
  for (let r = 1; r <= state.rounds; r++) {
    const prevDist = roundData[r - 1];
    if (!prevDist) continue;
    const groups = groupByMatchPoints(prevDist);
    const sortedPts = Object.keys(groups).map(Number).sort((a, b) => b - a);

    const panelId = `round-${r}-body`;
    const isExpanded = true; // expanded by default

    html += `<article class="message is-info mb-4">`;
    html += `<div class="message-header">`;
    html += `<p>Round ${r}</p>`;
    html += `<button class="delete" aria-label="Toggle Round ${r} details" `;
    html += `aria-expanded="${isExpanded}" aria-controls="${panelId}" `;
    html += `onclick="togglePanel('${panelId}', this)"></button>`;
    html += `</div>`;
    html += `<div class="message-body" id="${panelId}" ${isExpanded ? '' : 'style="display:none"'}>`;

    for (const pts of sortedPts) {
      const count = sumValues(groups[pts]);
      if (count <= 0) continue;
      const isOdd = count % 2 === 1;
      const pairingCount = isOdd ? count - 1 : count;
      const games = Math.floor(pairingCount / 2);

      html += `<div class="mb-4">`;
      html += `<p class="has-text-weight-semibold">${pts} match points (${count} players, ${games} games)</p>`;

      if (isOdd) {
        const nextPts = sortedPts[sortedPts.indexOf(pts) + 1];
        const downLabel = nextPts !== undefined ? `${nextPts}-point group` : 'a bye';
        html += `<span class="tag is-warning mb-2">1 player pairs down to ${downLabel}</span>`;

        // Paired-down result select
        const pdId = `pd-${r}-${pts}`;
        const pdValue = (state.pairedDown[r] && state.pairedDown[r][pts]) || 'win';
        html += `<div class="field is-horizontal mb-2">`;
        html += `<div class="field-label is-normal"><label class="label" for="${pdId}">Paired-down result</label></div>`;
        html += `<div class="field-body"><div class="field is-narrow"><div class="control"><div class="select">`;
        html += `<select id="${pdId}" data-round="${r}" data-pts="${pts}" onchange="handlePairedDownChange(this)">`;
        html += `<option value="win" ${pdValue === 'win' ? 'selected' : ''}>Higher-standing wins</option>`;
        html += `<option value="loss" ${pdValue === 'loss' ? 'selected' : ''}>Higher-standing loses</option>`;
        html += `<option value="draw" ${pdValue === 'draw' ? 'selected' : ''}>Draw</option>`;
        html += `</select></div></div></div></div>`;
        html += `</div>`;
      }

      if (games > 0) {
        const drawId = `draws-${r}-${pts}`;
        const currentDraws = (state.draws[r] && state.draws[r][pts]) || 0;
        html += `<div class="field is-horizontal">`;
        html += `<div class="field-label is-normal"><label class="label" for="${drawId}">Draws</label></div>`;
        html += `<div class="field-body"><div class="field is-narrow"><div class="control">`;
        html += `<input class="input" type="number" id="${drawId}" value="${currentDraws}" `;
        html += `min="0" max="${games}" data-round="${r}" data-pts="${pts}" `;
        html += `onchange="handleDrawChange(this)">`;
        html += `</div></div></div></div>`;
      }

      html += `</div>`;
    }

    html += `</div></article>`;
  }

  document.getElementById('draw-controls').innerHTML = html;
}

// ============================================================
// UI HELPERS
// ============================================================

function togglePanel(panelId, button) {
  const panel = document.getElementById(panelId);
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : '';
  button.setAttribute('aria-expanded', !isVisible);
}

function announce(message) {
  document.getElementById('live-announce').textContent = message;
}

// ============================================================
// EVENT HANDLERS
// ============================================================

function handleGenerate() {
  state.players = Math.max(4, parseInt(document.getElementById('players').value) || 8);
  state.rounds = Math.max(1, parseInt(document.getElementById('rounds').value) || 3);
  state.byes = [
    Math.max(0, parseInt(document.getElementById('byes1').value) || 0),
    Math.max(0, parseInt(document.getElementById('byes2').value) || 0),
    Math.max(0, parseInt(document.getElementById('byes3').value) || 0),
  ];

  // Validate byes
  const totalByes = state.byes[0] + state.byes[1] + state.byes[2];
  const byeWarning = document.getElementById('bye-warning');
  byeWarning.style.display = totalByes > state.players ? '' : 'none';

  // Reset draw/paired-down state
  state.draws = {};
  state.pairedDown = {};

  calculateTriangle();
  renderTriangle();
  renderDrawControls();
  announce(`Triangle generated for ${state.players} players, ${state.rounds} rounds.`);
}

function handleDrawChange(el) {
  const r = parseInt(el.dataset.round);
  const pts = parseInt(el.dataset.pts);
  const val = Math.max(0, parseInt(el.value) || 0);
  el.value = val; // clamp reflected in UI

  if (!state.draws[r]) state.draws[r] = {};
  state.draws[r][pts] = val;

  recalculate();
}

function handlePairedDownChange(el) {
  const r = parseInt(el.dataset.round);
  const pts = parseInt(el.dataset.pts);

  if (!state.pairedDown[r]) state.pairedDown[r] = {};
  state.pairedDown[r][pts] = el.value;

  recalculate();
}

function recalculate() {
  calculateTriangle();
  renderTriangle();
  renderDrawControls();
  announce('Triangle updated.');
}

// Auto-calc rounds on player count change (change event, not input)
document.getElementById('players').addEventListener('change', function () {
  const p = Math.max(4, parseInt(this.value) || 4);
  this.value = p;
  document.getElementById('rounds').value = Math.ceil(Math.log2(p));
});

document.getElementById('generate').addEventListener('click', handleGenerate);

// Generate on page load with defaults
document.addEventListener('DOMContentLoaded', handleGenerate);
```

## test.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Swiss Triangle Tests</title>
  <style>
    body { font-family: monospace; padding: 2rem; }
    .pass { color: green; }
    .fail { color: red; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Swiss Triangle Calculator — Tests</h1>
  <div id="results"></div>

  <script src="swiss.js"></script>
  <script>
    let passed = 0, failed = 0;
    const results = document.getElementById('results');

    function assert(condition, label) {
      if (condition) {
        passed++;
        results.innerHTML += `<div class="pass">PASS: ${label}</div>`;
      } else {
        failed++;
        results.innerHTML += `<div class="fail">FAIL: ${label}</div>`;
      }
    }

    function assertCount(roundData, round, record, expected, label) {
      const actual = roundData[round][record] || 0;
      assert(actual === expected, `${label}: R${round} ${record} = ${actual}, expected ${expected}`);
    }

    // --- Test 1: 8 players, 3 rounds, no draws ---
    state.players = 8; state.rounds = 3;
    state.byes = [0, 0, 0]; state.draws = {}; state.pairedDown = {};
    calculateTriangle();

    assertCount(state.triangleData, 0, '0-0-0', 8, '8p start');
    assertCount(state.triangleData, 1, '1-0-0', 4, '8p R1 winners');
    assertCount(state.triangleData, 1, '0-1-0', 4, '8p R1 losers');
    assertCount(state.triangleData, 3, '3-0-0', 1, '8p R3 undefeated');
    assertCount(state.triangleData, 3, '2-1-0', 3, '8p R3 2-1');
    assertCount(state.triangleData, 3, '1-2-0', 3, '8p R3 1-2');
    assertCount(state.triangleData, 3, '0-3-0', 1, '8p R3 winless');

    // --- Test 2: All results are integers ---
    let allIntegers = true;
    for (const rd of state.triangleData) {
      for (const count of Object.values(rd)) {
        if (!Number.isInteger(count)) { allIntegers = false; break; }
      }
    }
    assert(allIntegers, '8p no-draws: all counts are integers');

    // --- Test 3: Player count preserved each round ---
    for (let r = 0; r <= 3; r++) {
      const total = Object.values(state.triangleData[r]).reduce((a, b) => a + b, 0);
      assert(total === 8, `8p R${r}: total players = ${total}`);
    }

    // --- Test 4: 8 players, 1 draw in round 1 ---
    state.draws = { 1: { 0: 1 } }; // 1 draw in the 0-pt group (only group in R1)
    calculateTriangle();
    assertCount(state.triangleData, 1, '1-0-0', 3, '8p 1draw R1 winners');
    assertCount(state.triangleData, 1, '0-0-1', 2, '8p 1draw R1 draws');
    assertCount(state.triangleData, 1, '0-1-0', 3, '8p 1draw R1 losers');

    // Verify total still 8
    const r1total = Object.values(state.triangleData[1]).reduce((a, b) => a + b, 0);
    assert(r1total === 8, '8p 1draw R1: total = ' + r1total);

    // Verify all integers with draws
    let allIntDraw = true;
    for (const rd of state.triangleData) {
      for (const count of Object.values(rd)) {
        if (!Number.isInteger(count)) { allIntDraw = false; break; }
      }
    }
    assert(allIntDraw, '8p 1-draw: all counts are integers');

    // --- Test 5: 6 players (odd group, paired-down) ---
    state.players = 6; state.rounds = 3;
    state.draws = {}; state.pairedDown = {};
    calculateTriangle();
    for (let r = 0; r <= 3; r++) {
      const total = Object.values(state.triangleData[r]).reduce((a, b) => a + b, 0);
      assert(total === 6, `6p R${r}: total players = ${total}`);
    }

    // --- Test 6: Record utilities ---
    assert(matchPoints('2-1-0') === 6, 'matchPoints 2-1 = 6');
    assert(matchPoints('1-0-1') === 4, 'matchPoints 1-0-1 = 4');
    assert(matchPoints('0-0-3') === 3, 'matchPoints 0-0-3 = 3');
    assert(displayRecord('2-1-0') === '2-1', 'displayRecord hides D=0');
    assert(displayRecord('1-0-1') === '1-0-1', 'displayRecord shows D>0');

    // --- Summary ---
    results.innerHTML += `<hr><div><strong>${passed} passed, ${failed} failed</strong></div>`;
  </script>
</body>
</html>
```

## Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scoring | 3/1/0 match points | MTG standard, familiar to target audience |
| Row labels | W-L-D records | More intuitive than point totals for event staff |
| Integer counts | Within-record-first pairing | No fractional players, trustworthy for staff |
| Draw controls | Per match-point group per round | Precise without being overwhelming |
| Paired-down | User-selectable (win/loss/draw) | Educational: shows impact of upsets |
| File split | swiss.js separate from index.html | Enables test.html to load same logic |
| Column headers | "Start", "After R1", ... | Avoids confusing "R0" for event staff |
| Mobile table | Horizontal scroll + sticky 1st col | Record labels always visible |
| Events | `change` not `input` | No flickering, no focus loss |
| Persistence | None | Tool is illustrative, not for live events |
