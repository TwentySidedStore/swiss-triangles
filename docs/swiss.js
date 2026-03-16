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

  // Collect all match-point values that appear across any round
  const allMatchPoints = new Set();
  for (const rd of roundData) {
    for (const [rec, count] of Object.entries(rd)) {
      if (count > 0) allMatchPoints.add(matchPoints(rec));
    }
  }

  // Sort columns by match points descending (best record on left)
  const sortedPts = [...allMatchPoints].sort((a, b) => b - a);

  // Find maximum count for proportional colour shading
  const allCounts = roundData.flatMap(rd => Object.values(rd).filter(v => v > 0));
  const maxCount = allCounts.length > 0 ? Math.max(...allCounts) : 1;

  // Build column header labels
  let html = '<div class="table-container">';
  html += '<table class="table is-bordered is-hoverable is-fullwidth" aria-label="Swiss tournament record distribution">';
  html += '<thead><tr>';
  html += '<th scope="col">Round</th>';
  for (const pts of sortedPts) {
    const label = pts === 1 ? '1 pt' : `${pts} pts`;
    html += `<th scope="col" class="has-text-centered">${label}</th>`;
  }
  html += '</tr></thead>';
  html += '<tbody>';

  // One row per round
  for (let r = 0; r < roundData.length; r++) {
    const roundLabel = r === 0 ? 'Start' : `After R${r}`;
    html += '<tr>';
    html += `<th scope="row" class="round-label">${roundLabel}</th>`;

    // Group this round's records by match points
    const roundGroups = {};
    for (const [rec, count] of Object.entries(roundData[r])) {
      if (count <= 0) continue;
      const pts = matchPoints(rec);
      if (!roundGroups[pts]) roundGroups[pts] = [];
      roundGroups[pts].push({ rec, count });
    }

    for (const pts of sortedPts) {
      const entries = roundGroups[pts];
      if (!entries || entries.length === 0) {
        html += '<td class="triangle-cell"></td>';
        continue;
      }

      // Total count in this cell for shading
      const cellTotal = entries.reduce((s, e) => s + e.count, 0);
      const intensity = 0.10 + (cellTotal / maxCount) * 0.30;
      const bg = `background:rgba(50,115,220,${intensity.toFixed(2)})`;

      if (entries.length === 1) {
        // Single record at this match-point level
        const { rec, count } = entries[0];
        html += `<td class="triangle-cell" style="${bg}">`;
        html += `<div class="cell-count">${count}</div>`;
        html += `<div class="cell-record">${displayRecord(rec)}</div>`;
        html += '</td>';
      } else {
        // Multiple records at same match points (rare, e.g. 1-2 and 0-0-3)
        // Sort by wins descending
        entries.sort((a, b) => parseRecord(b.rec).w - parseRecord(a.rec).w);
        html += `<td class="triangle-cell cell-multi-record" style="${bg}">`;
        for (const { rec, count } of entries) {
          html += `<div><span class="cell-count">${count}</span> <span class="cell-record">${displayRecord(rec)}</span></div>`;
        }
        html += '</td>';
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
 * Simulate the carry-down chain for a round to determine:
 * - How many within-group games each group has (for draw input max)
 * - Which groups send a carry-down and the actual records involved
 *
 * Returns an array of group info objects (top-down by match points):
 *   { pts, originalCount, withinGames, pairedDownGame, receivesCarryDown, isBottomBye }
 *
 * pairedDownGame (if this group sends a carry-down to a lower group):
 *   { carryRecord, opponentRecord, sourcePts }
 *
 * This mirrors processRound logic but only tracks structure, not results.
 */
function computeRoundPairingInfo(prevDist, roundNum, byes) {
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

  const info = [];
  let carryDown = null; // { record, sourcePts }

  for (let gi = 0; gi < sortedPts.length; gi++) {
    const pts = sortedPts[gi];
    const records = Object.assign({}, groups[pts]);
    const originalCount = sumValues(records);

    let receivesCarryDown = false;

    // Absorb incoming carry-down: resolve the carry-down game,
    // removing 1 opponent from this group's pool
    if (carryDown !== null) {
      receivesCarryDown = true;
      const opponentEntries = Object.entries(records)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1]);

      if (opponentEntries.length > 0) {
        const [oppRec] = opponentEntries[0];
        records[oppRec] -= 1;
        if (records[oppRec] <= 0) delete records[oppRec];
      }
      carryDown = null;
    }

    // Within-record pairing for remaining players
    const recordEntries = Object.entries(records).filter(([, c]) => c > 0);
    const remainingTotal = recordEntries.reduce((s, [, c]) => s + c, 0);
    const withinGames = Math.floor(remainingTotal / 2);

    // Determine leftovers
    const leftovers = [];
    for (const [rec, count] of recordEntries) {
      if (count % 2 === 1) leftovers.push(rec);
    }
    leftovers.sort((a, b) => matchPoints(b) - matchPoints(a));
    while (leftovers.length >= 2) {
      leftovers.shift();
      leftovers.shift();
    }

    let outgoingRecord = null;
    if (leftovers.length === 1) {
      outgoingRecord = leftovers[0];
      carryDown = { record: leftovers[0], sourcePts: pts };
    }

    info.push({
      pts,
      originalCount,
      withinGames,
      outgoingRecord,
      receivesCarryDown,
      pairedDownGame: null, // filled in below
      isBottomBye: false    // filled in below
    });
  }

  // Now link each outgoing carry-down to its opponent in the next group
  for (let i = 0; i < info.length; i++) {
    if (!info[i].outgoingRecord) continue;

    // Find the next group that receives this carry-down
    if (i + 1 < info.length) {
      // Replay the opponent lookup for this specific carry-down
      const nextPts = info[i + 1].pts;
      const nextRecords = Object.assign({}, groups[nextPts]);

      // If the next group itself received a carry-down from an even higher group,
      // that carry-down already consumed one opponent. We need to replay the full
      // chain to find the correct opponent. Fortunately, we already did this above
      // when computing the info array. We can re-derive the opponent by replaying
      // just the carry-down absorption for groups above nextPts.
      const replayDist = Object.assign({}, prevDist);
      // Remove byes
      for (let bi = 0; bi < byes.length; bi++) {
        if (roundNum <= (bi + 1) && byes[bi] > 0) {
          const byeRec = recordKey(roundNum - 1, 0, 0);
          const available = replayDist[byeRec] || 0;
          const removing = Math.min(byes[bi], available);
          replayDist[byeRec] = available - removing;
          if (replayDist[byeRec] <= 0) delete replayDist[byeRec];
        }
      }
      const replayGroups = groupByMatchPoints(replayDist);

      // Replay carry-down chain from top down to find the actual opponent
      let replayCD = null;
      for (let ri = 0; ri <= i + 1 && ri < info.length; ri++) {
        const rPts = info[ri].pts;
        const rRecords = Object.assign({}, replayGroups[rPts] || {});

        if (replayCD !== null) {
          const oppEntries = Object.entries(rRecords)
            .filter(([, c]) => c > 0)
            .sort((a, b) => b[1] - a[1]);
          if (oppEntries.length > 0) {
            const [oppRec] = oppEntries[0];
            if (ri === i + 1) {
              // This is the group our carry-down lands in
              info[i].pairedDownGame = {
                carryRecord: info[i].outgoingRecord,
                opponentRecord: oppRec,
                sourcePts: info[i].pts
              };
            }
            rRecords[oppRec] -= 1;
            if (rRecords[oppRec] <= 0) delete rRecords[oppRec];
          }
          replayCD = null;
        }

        // Compute leftovers for this replay group
        const rEntries = Object.entries(rRecords).filter(([, c]) => c > 0);
        const rLeftovers = [];
        for (const [rec, count] of rEntries) {
          if (count % 2 === 1) rLeftovers.push(rec);
        }
        rLeftovers.sort((a, b) => matchPoints(b) - matchPoints(a));
        while (rLeftovers.length >= 2) {
          rLeftovers.shift();
          rLeftovers.shift();
        }
        if (rLeftovers.length === 1) {
          replayCD = { record: rLeftovers[0], sourcePts: rPts };
        }
      }
    } else {
      // No lower group — this carry-down gets a bye
      info[i].isBottomBye = true;
    }
  }

  return info;
}

/**
 * Build the per-round collapsible panels.
 */
function renderDrawControls() {
  const roundData = state.triangleData;
  if (!roundData) return;

  let html = '';

  for (let r = 1; r <= state.rounds; r++) {
    const prevDist = roundData[r - 1];
    if (!prevDist) continue;

    const groupInfo = computeRoundPairingInfo(prevDist, r, state.byes);
    if (groupInfo.length === 0) continue;

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

    for (let gi = 0; gi < groupInfo.length; gi++) {
      const g = groupInfo[gi];

      // Group header
      html += `<div class="mb-4">`;
      html += `<p class="has-text-weight-bold is-size-6 mb-2">`;
      html += `${g.pts} match points &middot; ${g.originalCount} players`;
      if (g.withinGames > 0) {
        html += ` &middot; ${g.withinGames} ${g.withinGames === 1 ? 'game' : 'games'}`;
      }
      html += `</p>`;

      // Drawn matches input (only if there are within-group games)
      if (g.withinGames > 0) {
        const drawId = `draws-${r}-${g.pts}`;
        const currentDraws = (state.draws[r] && state.draws[r][g.pts] !== undefined)
          ? state.draws[r][g.pts]
          : 0;
        html += `<div class="field mb-3">`;
        html += `<label class="label" for="${drawId}">Drawn matches</label>`;
        html += `<div class="control" style="max-width:6rem">`;
        html += `<input class="input" type="number" id="${drawId}" `;
        html += `value="${currentDraws}" min="0" max="${g.withinGames}" `;
        html += `data-round="${r}" data-pts="${g.pts}" onchange="handleDrawChange(this)">`;
        html += `</div>`;
        html += `<p class="help">Out of ${g.withinGames} ${g.withinGames === 1 ? 'game' : 'games'} in this group</p>`;
        html += `</div>`;
      }

      // Paired-down game (this group sends a carry-down to a lower group)
      if (g.pairedDownGame) {
        const pd = g.pairedDownGame;
        const cdDisplay = displayRecord(pd.carryRecord);
        const oppDisplay = displayRecord(pd.opponentRecord);

        html += `<div class="notification is-warning is-light py-3 px-4 mb-2">`;
        html += `<p class="has-text-weight-semibold mb-2">Paired down: ${cdDisplay} vs ${oppDisplay}</p>`;

        const pdId = `pd-${r}-${pd.sourcePts}`;
        const pdValue = (state.pairedDown[r] && state.pairedDown[r][pd.sourcePts] !== undefined)
          ? state.pairedDown[r][pd.sourcePts]
          : 'win';

        html += `<div class="field mb-0">`;
        html += `<label class="label" for="${pdId}">Result</label>`;
        html += `<div class="control"><div class="select">`;
        html += `<select id="${pdId}" data-round="${r}" data-pts="${pd.sourcePts}" onchange="handlePairedDownChange(this)">`;
        html += `<option value="win"${pdValue === 'win' ? ' selected' : ''}>${cdDisplay} player wins</option>`;
        html += `<option value="loss"${pdValue === 'loss' ? ' selected' : ''}>${cdDisplay} player loses</option>`;
        html += `<option value="draw"${pdValue === 'draw' ? ' selected' : ''}>Draw</option>`;
        html += `</select></div></div>`;
        html += `</div>`;
        html += `</div>`; // end notification
      } else if (g.isBottomBye) {
        html += `<p class="mb-2"><span class="tag is-warning">1 player receives a bye</span></p>`;
      }

      html += `</div>`; // end group div

      // Horizontal rule between groups (not after last)
      if (gi < groupInfo.length - 1) {
        html += `<hr class="my-3">`;
      }
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
