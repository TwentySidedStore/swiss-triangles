// ============================================================
// STATE
// ============================================================
const state = {
  players: 8,
  rounds: 3,
  byes: [0, 0, 0],     // byes[0] = 1-round bye count, byes[1] = 2-round, byes[2] = 3-round
  draws: {},            // draws[roundNum][matchPoints] = numDraws
  pairedDown: {},       // pairedDown[roundNum][matchPoints] = 'win'|'loss'|'draw'
  triangleData: null    // computed: array (index = round) of { record: count }
};

// ============================================================
// RECORD UTILITIES
// ============================================================

/**
 * Canonical string key for a record.
 */
function recordKey(w, l, d) {
  return `${w}-${l}-${d}`;
}

/**
 * Parse a record key back into { w, l, d }.
 */
function parseRecord(key) {
  const parts = key.split('-').map(Number);
  return { w: parts[0], l: parts[1], d: parts[2] };
}

/**
 * Match points for a record key (win=3, draw=1, loss=0).
 */
function matchPoints(key) {
  const { w, d } = parseRecord(key);
  return w * 3 + d;
}

/**
 * Human-readable label: "2-1" (omit draws when 0), "2-1-1" when draws > 0.
 */
function displayRecord(key) {
  const { w, l, d } = parseRecord(key);
  return d > 0 ? `${w}-${l}-${d}` : `${w}-${l}`;
}

/**
 * Return the record key that results from adding a win.
 */
function addWin(key) {
  const { w, l, d } = parseRecord(key);
  return recordKey(w + 1, l, d);
}

/**
 * Return the record key that results from adding a loss.
 */
function addLoss(key) {
  const { w, l, d } = parseRecord(key);
  return recordKey(w, l + 1, d);
}

/**
 * Return the record key that results from adding a draw.
 */
function addDraw(key) {
  const { w, l, d } = parseRecord(key);
  return recordKey(w, l, d + 1);
}

// ============================================================
// DISTRIBUTION HELPERS
// ============================================================

/**
 * Group a distribution { record: count } by match points.
 * Returns { pts: { record: count, ... }, ... } — only non-zero counts.
 */
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

/**
 * Sum all values in an object.
 */
function sumValues(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0);
}

/**
 * Add `count` players of record `key` to a distribution dict.
 * Ignores zero/negative counts.
 */
function addToDist(dist, key, count) {
  if (!count || count <= 0) return;
  dist[key] = (dist[key] || 0) + count;
}

// ============================================================
// CORE TRIANGLE CALCULATION
// ============================================================

/**
 * Recalculate all rounds and store in state.triangleData.
 */
function calculateTriangle() {
  const { players, rounds, byes, draws, pairedDown } = state;
  const roundData = [];

  // Round 0: all players start at 0-0-0
  roundData[0] = { [recordKey(0, 0, 0)]: players };

  for (let r = 1; r <= rounds; r++) {
    roundData[r] = processRound(
      roundData[r - 1],
      r,
      (draws[r] || {}),
      (pairedDown[r] || {}),
      byes
    );
  }

  state.triangleData = roundData;
}

/**
 * Process one round.
 *
 * Algorithm:
 *  1. Remove bye players from the active pool (they auto-win).
 *  2. Group active players by match points, process top-down.
 *  3. Within each group:
 *     a. Merge any carry-down player from the higher group.
 *     b. If a carry-down player is present, resolve their game first
 *        (pairedDown config says who wins: 'win' = carry-down wins,
 *         'loss' = carry-down loses, 'draw' = both draw).
 *     c. Within-record pairing for the remaining players.
 *     d. Cross-record leftover pairing (higher record wins, deterministic).
 *     e. If 1 leftover remains, carry it down to the next group.
 *  4. Final leftover (bottom of the bracket) gets a bye (free win).
 *  5. Re-add bye players with +1 win.
 */
function processRound(prevDist, roundNum, drawsConfig, pdConfig, byes) {
  // Work on a mutable copy
  const dist = Object.assign({}, prevDist);

  // ---- 1. Remove bye players ----
  // Any player with an N-round bye gets a free win in rounds 1..N.
  // They are always at the record (roundNum-1)-0-0 at the start of round roundNum.
  const byeRecords = {};
  for (let i = 0; i < byes.length; i++) {
    const byeRounds = i + 1; // byes[0] = 1-round bye, etc.
    if (roundNum <= byeRounds) {
      const byeCount = byes[i];
      if (byeCount > 0) {
        const byeRec = recordKey(roundNum - 1, 0, 0);
        const available = dist[byeRec] || 0;
        const removing = Math.min(byeCount, available);
        if (removing > 0) {
          dist[byeRec] = available - removing;
          if (dist[byeRec] <= 0) delete dist[byeRec];
          byeRecords[byeRec] = (byeRecords[byeRec] || 0) + removing;
        }
      }
    }
  }

  // ---- 2. Group by match points, process top-down ----
  const groups = groupByMatchPoints(dist);
  const sortedPts = Object.keys(groups).map(Number).sort((a, b) => b - a);

  const newDist = {};

  // carryDown: { record: string, sourcePts: number } | null
  // sourcePts = match points of the group the carry-down came FROM,
  // so we can look up the right pdConfig entry.
  let carryDown = null;

  for (let gi = 0; gi < sortedPts.length; gi++) {
    const pts = sortedPts[gi];
    // Make a mutable copy of this group's distribution
    const records = Object.assign({}, groups[pts]);

    // ---- 3a. Resolve carry-down game first ----
    if (carryDown !== null) {
      const cdRec = carryDown.record;
      const cdSourcePts = carryDown.sourcePts;

      // Find an opponent from this group: pick the record with the most players
      // (deterministic and favors the largest sub-group).
      const opponentEntries = Object.entries(records)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1]);

      if (opponentEntries.length > 0) {
        const [oppRec] = opponentEntries[0];

        // Consume one carry-down player and one opponent player
        // (they are no longer part of the within-record pairing pool)
        records[oppRec] -= 1;
        if (records[oppRec] <= 0) delete records[oppRec];

        // Determine outcome based on pdConfig keyed by the SOURCE group's pts
        const outcome = (pdConfig[cdSourcePts]) || 'win';

        if (outcome === 'win') {
          // carry-down player wins
          addToDist(newDist, addWin(cdRec), 1);
          addToDist(newDist, addLoss(oppRec), 1);
        } else if (outcome === 'loss') {
          // carry-down player loses
          addToDist(newDist, addLoss(cdRec), 1);
          addToDist(newDist, addWin(oppRec), 1);
        } else {
          // draw
          addToDist(newDist, addDraw(cdRec), 1);
          addToDist(newDist, addDraw(oppRec), 1);
        }
      } else {
        // No opponents left in this group — carry-down gets a bye
        addToDist(newDist, addWin(cdRec), 1);
      }

      carryDown = null;
    }

    // ---- 3b. Within-record pairing for remaining players ----
    const recordEntries = Object.entries(records).filter(([, c]) => c > 0);
    if (recordEntries.length === 0) continue;

    const groupTotal = recordEntries.reduce((s, [, c]) => s + c, 0);
    const groupGames = Math.floor(groupTotal / 2);
    const rawGroupDraws = (drawsConfig[pts] !== undefined) ? drawsConfig[pts] : 0;
    const groupDraws = Math.min(Math.max(0, rawGroupDraws), groupGames);

    // Calculate per-sub-record within-games to distribute draws proportionally
    // Sort by game count desc so we allocate draws to largest subgroup first
    const sortedForDraws = [...recordEntries].sort((a, b) => {
      const ga = Math.floor(a[1] / 2);
      const gb = Math.floor(b[1] / 2);
      return gb - ga;
    });

    const totalWithinGames = sortedForDraws.reduce((s, [, c]) => s + Math.floor(c / 2), 0);
    const subRecordDraws = {};

    // Proportional allocation with rounding; adjust last entry to hit exact total
    if (totalWithinGames > 0) {
      let allocated = 0;
      for (let si = 0; si < sortedForDraws.length; si++) {
        const [rec, count] = sortedForDraws[si];
        const games = Math.floor(count / 2);
        if (games === 0) {
          subRecordDraws[rec] = 0;
          continue;
        }
        if (si === sortedForDraws.length - 1) {
          // Last entry: give remainder to hit exact total
          subRecordDraws[rec] = Math.min(groupDraws - allocated, games);
        } else {
          const share = Math.min(
            Math.round(groupDraws * games / totalWithinGames),
            games,
            groupDraws - allocated
          );
          subRecordDraws[rec] = Math.max(0, share);
          allocated += subRecordDraws[rec];
        }
      }
    }

    // Pair within each record sub-group
    const leftovers = []; // records that have an odd player left over

    for (const [rec, count] of recordEntries) {
      const games = Math.floor(count / 2);
      const draws = subRecordDraws[rec] || 0;
      const decisive = games - draws;

      if (decisive > 0) {
        addToDist(newDist, addWin(rec), decisive);
        addToDist(newDist, addLoss(rec), decisive);
      }
      if (draws > 0) {
        // Both players in each drawn game get a draw result
        addToDist(newDist, addDraw(rec), draws * 2);
      }

      if (count % 2 === 1) {
        leftovers.push(rec);
      }
    }

    // ---- 3c. Cross-record leftover pairing ----
    // Sort leftovers by match points desc so higher record "wins" is deterministic
    leftovers.sort((a, b) => matchPoints(b) - matchPoints(a));

    while (leftovers.length >= 2) {
      const recA = leftovers.shift(); // higher (or equal) match points
      const recB = leftovers.shift();
      // Default: higher-standing player wins (deterministic)
      addToDist(newDist, addWin(recA), 1);
      addToDist(newDist, addLoss(recB), 1);
    }

    // ---- 3d. If 1 leftover remains, it carries down ----
    if (leftovers.length === 1) {
      carryDown = { record: leftovers[0], sourcePts: pts };
    }
  }

  // ---- 4. Final carry-down has no next group — they get a bye ----
  if (carryDown !== null) {
    addToDist(newDist, addWin(carryDown.record), 1);
    carryDown = null;
  }

  // ---- 5. Re-add bye players with +1 win ----
  for (const [rec, count] of Object.entries(byeRecords)) {
    if (count > 0) {
      addToDist(newDist, addWin(rec), count);
    }
  }

  return newDist;
}

// ============================================================
// RENDERING — TRIANGLE TABLE
// ============================================================

function renderTriangle() {
  const roundData = state.triangleData;
  if (!roundData) return;

  document.getElementById('how-to-read').style.display = '';

  // Collect every record that appears with a positive count in any round
  const allRecords = new Set();
  for (const rd of roundData) {
    for (const [rec, count] of Object.entries(rd)) {
      if (count > 0) allRecords.add(rec);
    }
  }

  // Sort: match points descending, then wins descending, then draws descending
  const sorted = [...allRecords].sort((a, b) => {
    const ptsDiff = matchPoints(b) - matchPoints(a);
    if (ptsDiff !== 0) return ptsDiff;
    const pa = parseRecord(a);
    const pb = parseRecord(b);
    if (pb.w !== pa.w) return pb.w - pa.w;
    return pb.d - pa.d;
  });

  // Find maximum count for proportional colour shading
  const allCounts = roundData.flatMap(rd => Object.values(rd).filter(v => v > 0));
  const maxCount = allCounts.length > 0 ? Math.max(...allCounts) : 1;

  let html = '<div class="table-container">';
  html += '<table class="table is-bordered is-hoverable is-fullwidth" aria-label="Swiss tournament record distribution">';
  html += '<thead><tr>';
  html += '<th scope="col" class="record-label">Record</th>';
  html += '<th scope="col">Pts</th>';
  for (let r = 0; r < roundData.length; r++) {
    const label = r === 0 ? 'Start' : `After R${r}`;
    html += `<th scope="col">${label}</th>`;
  }
  html += '</tr></thead>';
  html += '<tbody>';

  for (const rec of sorted) {
    const pts = matchPoints(rec);
    html += '<tr>';
    html += `<th scope="row" class="record-label">${displayRecord(rec)} <span class="has-text-grey-light is-size-7">(${pts} pts)</span></th>`;
    html += `<td class="has-text-centered">${pts}</td>`;
    for (let r = 0; r < roundData.length; r++) {
      const count = roundData[r][rec] || 0;
      if (count > 0) {
        // Opacity: min 10%, max 40%, proportional to count
        const intensity = 0.10 + (count / maxCount) * 0.30;
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
// RENDERING — DRAW & PAIRED-DOWN CONTROLS
// ============================================================

/**
 * Build the per-round collapsible panels.
 *
 * For each round we show each match-point group from the PREVIOUS round's
 * distribution (those are the players who will be paired in this round).
 *
 * Paired-down label uses ACTUAL records so it reads e.g.
 *   "Paired-down game: 1-0 vs 0-1"
 * with a select showing "1-0 player wins / 1-0 player loses / Draw".
 */
function renderDrawControls() {
  const roundData = state.triangleData;
  if (!roundData) return;

  let html = '';

  for (let r = 1; r <= state.rounds; r++) {
    const prevDist = roundData[r - 1];
    if (!prevDist) continue;

    // Temporarily replay the round to discover the actual paired-down pairing
    // (carry-down record and its opponent record) for labelling purposes.
    const pdLabels = computePairedDownLabels(prevDist, r, state.byes);

    const groups = groupByMatchPoints(prevDist);
    const sortedPts = Object.keys(groups).map(Number).sort((a, b) => b - a);

    // Skip rounds where there are no active players to pair
    const hasActivePlayers = sortedPts.some(pts => sumValues(groups[pts]) > 0);
    if (!hasActivePlayers) continue;

    const panelBodyId = `round-${r}-body`;

    html += `<article class="message is-info mb-4">`;
    html += `<div class="message-header" style="align-items:center">`;
    html += `<p>Round ${r}</p>`;
    html += `<button class="panel-toggle" `;
    html += `aria-label="Toggle Round ${r} details" `;
    html += `aria-expanded="true" `;
    html += `aria-controls="${panelBodyId}" `;
    html += `data-panel="${panelBodyId}">&#x25BC;</button>`;
    html += `</div>`;
    html += `<div class="message-body" id="${panelBodyId}">`;

    // We need to track carry-down state to know which group has the paired-down game
    // and what the actual records involved are.
    // pdLabels[sourcePts] = { carryRecord, opponentRecord }

    for (const pts of sortedPts) {
      // Remove bye players from this group's count for display purposes
      // (same logic as processRound step 1, but we only need the count)
      let byeCount = 0;
      for (let i = 0; i < state.byes.length; i++) {
        if (r <= (i + 1)) byeCount += state.byes[i];
      }
      const byeRec = recordKey(r - 1, 0, 0);
      const rawCount = sumValues(groups[pts]);
      // Subtract bye players who happen to be in this group
      let activeCount = rawCount;
      if (pts === matchPoints(byeRec)) {
        activeCount = Math.max(0, rawCount - Math.min(byeCount, rawCount));
      }
      if (activeCount <= 0) continue;

      // After removing bye players, recalculate games
      // Also account for: if a carry-down from a HIGHER group lands here,
      // that carry-down game is separate from the within-group games.
      // We show the within-group games count (before carry-down is absorbed).
      const gamesInGroup = Math.floor(activeCount / 2);

      html += `<div class="mb-4">`;
      html += `<p class="has-text-weight-semibold">${pts} match points (${activeCount} players, ${gamesInGroup} games)</p>`;

      // Paired-down indicator: this group SENDS a carry-down when it has odd activeCount
      if (activeCount % 2 === 1) {
        const nextIdx = sortedPts.indexOf(pts) + 1;
        const nextPts = sortedPts[nextIdx];
        const label = pdLabels[pts];

        if (label) {
          // Show actual records
          const cdDisplay = displayRecord(label.carryRecord);
          const oppDisplay = displayRecord(label.opponentRecord);
          html += `<p class="mb-2"><span class="tag is-warning">Paired-down game: ${cdDisplay} vs ${oppDisplay}</span></p>`;

          const pdId = `pd-${r}-${pts}`;
          const pdValue = (state.pairedDown[r] && state.pairedDown[r][pts] !== undefined)
            ? state.pairedDown[r][pts]
            : 'win';

          html += `<div class="field is-horizontal mb-2">`;
          html += `<div class="field-label is-normal">`;
          html += `<label class="label" for="${pdId}">Result</label>`;
          html += `</div>`;
          html += `<div class="field-body"><div class="field is-narrow"><div class="control"><div class="select">`;
          html += `<select id="${pdId}" data-round="${r}" data-pts="${pts}" onchange="handlePairedDownChange(this)">`;
          html += `<option value="win"${pdValue === 'win' ? ' selected' : ''}>${cdDisplay} player wins</option>`;
          html += `<option value="loss"${pdValue === 'loss' ? ' selected' : ''}>${cdDisplay} player loses</option>`;
          html += `<option value="draw"${pdValue === 'draw' ? ' selected' : ''}>Draw</option>`;
          html += `</select></div></div></div></div>`;
        } else {
          // Bottom of the bracket — carry-down gets a bye
          const nextLabel = nextPts !== undefined ? `${nextPts}-point group` : 'a bye';
          html += `<p class="mb-2"><span class="tag is-warning">1 player carries down to ${nextLabel}</span></p>`;
        }
      }

      // Draws input (only if there are games in this group)
      if (gamesInGroup > 0) {
        const drawId = `draws-${r}-${pts}`;
        const currentDraws = (state.draws[r] && state.draws[r][pts] !== undefined)
          ? state.draws[r][pts]
          : 0;
        html += `<div class="field is-horizontal">`;
        html += `<div class="field-label is-normal">`;
        html += `<label class="label" for="${drawId}">Draws (max ${gamesInGroup})</label>`;
        html += `</div>`;
        html += `<div class="field-body"><div class="field is-narrow"><div class="control">`;
        html += `<input class="input" type="number" id="${drawId}" `;
        html += `value="${currentDraws}" min="0" max="${gamesInGroup}" `;
        html += `data-round="${r}" data-pts="${pts}" onchange="handleDrawChange(this)">`;
        html += `</div></div></div></div>`;
      }

      html += `</div>`; // end group div
    }

    html += `</div>`; // end message-body
    html += `</article>`;
  }

  document.getElementById('draw-controls').innerHTML = html;

  // Attach toggle listeners (re-attach since innerHTML was replaced)
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', handleToggle);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle.call(this);
      }
    });
  });
}

/**
 * Compute carry-down label info for each source match-point group.
 *
 * Returns an object keyed by source group pts:
 *   { [sourcePts]: { carryRecord: string, opponentRecord: string } }
 *
 * This mirrors the logic in processRound but only tracks identities,
 * not results, so the UI can display "1-0 vs 0-1" style labels.
 */
function computePairedDownLabels(prevDist, roundNum, byes) {
  const dist = Object.assign({}, prevDist);

  // Remove bye players
  for (let i = 0; i < byes.length; i++) {
    if (roundNum <= (i + 1) && byes[i] > 0) {
      const byeRec = recordKey(roundNum - 1, 0, 0);
      const available = dist[byeRec] || 0;
      const removing = Math.min(byes[i], available);
      dist[byeRec] = available - removing;
      if (dist[byeRec] <= 0) delete dist[byeRec];
    }
  }

  const groups = groupByMatchPoints(dist);
  const sortedPts = Object.keys(groups).map(Number).sort((a, b) => b - a);

  const labels = {};
  let carryDown = null; // { record, sourcePts }

  for (const pts of sortedPts) {
    const records = Object.assign({}, groups[pts]);

    if (carryDown !== null) {
      // Find the most-populated record as the opponent (same logic as processRound)
      const opponentEntries = Object.entries(records)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1]);

      if (opponentEntries.length > 0) {
        const [oppRec] = opponentEntries[0];
        // Store label keyed by the SOURCE group's pts
        labels[carryDown.sourcePts] = {
          carryRecord: carryDown.record,
          opponentRecord: oppRec
        };
        records[oppRec] -= 1;
        if (records[oppRec] <= 0) delete records[oppRec];
      }
      carryDown = null;
    }

    // Determine leftover from within-record pairing
    const recordEntries = Object.entries(records).filter(([, c]) => c > 0);

    const leftovers = [];
    for (const [rec, count] of recordEntries) {
      if (count % 2 === 1) leftovers.push(rec);
    }

    leftovers.sort((a, b) => matchPoints(b) - matchPoints(a));

    // Pair cross-record leftovers
    while (leftovers.length >= 2) {
      leftovers.shift();
      leftovers.shift();
    }

    if (leftovers.length === 1) {
      carryDown = { record: leftovers[0], sourcePts: pts };
    }
  }

  return labels;
}

// ============================================================
// UI HELPERS
// ============================================================

function handleToggle() {
  const panelId = this.getAttribute('data-panel');
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const isVisible = panel.style.display !== 'none';
  panel.style.display = isVisible ? 'none' : '';
  this.setAttribute('aria-expanded', String(!isVisible));
  this.textContent = !isVisible ? '\u25BC' : '\u25B6';
}

function announce(message) {
  const el = document.getElementById('live-announce');
  if (el) el.textContent = message;
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
    Math.max(0, parseInt(document.getElementById('byes3').value) || 0)
  ];

  const totalByes = state.byes[0] + state.byes[1] + state.byes[2];
  const byeWarning = document.getElementById('bye-warning');
  if (byeWarning) {
    byeWarning.style.display = totalByes > state.players ? '' : 'none';
  }

  // Reset draw/paired-down state on fresh generate
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
  el.value = val;

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

// ============================================================
// INITIALISATION
// ============================================================

// Auto-calc rounds when player count changes (change event avoids flicker while typing)
document.addEventListener('DOMContentLoaded', function () {
  const playersInput = document.getElementById('players');
  const roundsInput = document.getElementById('rounds');
  const generateBtn = document.getElementById('generate');

  if (playersInput) {
    playersInput.addEventListener('change', function () {
      const p = Math.max(4, parseInt(this.value) || 4);
      this.value = p;
      if (roundsInput) {
        roundsInput.value = Math.ceil(Math.log2(p));
      }
    });
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
  }

  // Generate on page load with defaults
  handleGenerate();
});
