// ── readiness.js ──
// Does walking in flat actually cost you the session?
//
// Everything here reads fields already on a mat session. The one rule
// that matters: the numbers must agree with focus.js. If this screen and
// the focus card disagree about the same sessions, both become useless.

import { getSessions } from './db.js';
import { sessionKind } from './ui.js';

// Below this there is not enough signal to say anything honest, and a
// chart drawn from six sessions is noise wearing a suit.
const FLOOR = 15;

const STEPS = [5, 4, 3, 2, 1];

/**
 * Sessions that can answer "did you reach your focus at this readiness".
 *
 * Both fields are required. A session logged before any focus existed
 * cannot answer the question, so it is excluded rather than counted as a
 * miss — the same reasoning focus.js uses for its denominator.
 */
function scoredSessions(mat) {
  return mat.filter(s => s.readiness != null && s.focusId);
}

/** 'yes' and 'partly' both count, exactly as focus.js attemptStats does. */
function reached(s) {
  return s.focusAttempted === 'yes' || s.focusAttempted === 'partly';
}

export function rateAt(scored, step) {
  const rows = scored.filter(s => s.readiness === step);
  if (rows.length === 0) return { n: 0, pct: null };
  return { n: rows.length, pct: rows.filter(reached).length / rows.length };
}

/** Pooled rather than 5-vs-1: per-step n is small and one session swings a step 20 points. */
export function pooledRate(scored, steps) {
  const rows = scored.filter(s => steps.includes(s.readiness));
  if (rows.length === 0) return { n: 0, pct: null };
  return { n: rows.length, pct: rows.filter(reached).length / rows.length };
}

/** Rounds is nullable independently of readiness, so this filters separately. */
export function roundsAt(mat, step) {
  const rows = mat.filter(s => s.readiness === step && s.rounds != null);
  if (rows.length === 0) return null;
  return rows.reduce((sum, s) => sum + s.rounds, 0) / rows.length;
}

const pct = v => v === null ? '—' : `${Math.round(v * 100)}%`;

// ── Render ──

function belowFloor(scoredCount, matCount) {
  const need = FLOOR - scoredCount;
  return `
    <div class="progress-section">
      <div class="stat-strip">
        <div class="stat-tile">
          <span class="stat-num">${scoredCount}</span>
          <span class="stat-label">of ${matCount} sessions scored</span>
        </div>
      </div>
      <div class="readiness-hold">
        ${need} more and this starts meaning something. Until then any split
        would be one or two sessions deciding the answer.
      </div>
      <div class="readiness-note">
        A session counts here once it carries both a readiness score and an
        active focus — without a focus there is no question for it to answer.
      </div>
    </div>`;
}

function rateRows(scored) {
  return STEPS.map(step => {
    const { n, pct: p } = rateAt(scored, step);
    // An absent step is not a zero. An empty track and a dash say "no
    // data"; a 0% bar would say "you never reach your focus at a 5".
    const empty = n === 0;
    return `
      <div class="readiness-row${empty ? ' is-empty' : ''}">
        <div class="readiness-key">
          <i class="readiness-swatch" style="background:var(--r${step})"></i>
          <span>${step} · n${n}</span>
        </div>
        <div class="coverage-track">
          ${empty ? '' : `<div class="coverage-bar" style="width:${Math.round(p * 100)}%;background:var(--r${step})"></div>`}
        </div>
        <div class="readiness-val">${pct(p)}</div>
      </div>`;
  }).join('');
}

function roundsChart(mat) {
  const avgs = [1, 2, 3, 4, 5].map(step => roundsAt(mat, step));
  const max = Math.max(1, ...avgs.filter(v => v !== null));
  const best = Math.max(...avgs.map(v => v ?? -1));

  // Labels sit in their own grid row above the track. Putting them inside
  // the bar's flex column steals from the bar's height and silently
  // clamps every tall bar to the same height.
  return `
    <div class="rounds-labels">
      ${avgs.map(v => `<span${v !== null && v === best ? ' class="is-best"' : ''}>${v === null ? '—' : v.toFixed(1)}</span>`).join('')}
    </div>
    <div class="rounds-track">
      ${avgs.map((v, i) => `<i style="height:${v === null ? 0 : Math.max(Math.round(v / max * 100), 4)}%;background:var(--r${i + 1})"></i>`).join('')}
    </div>
    <div class="rounds-axis">${[1, 2, 3, 4, 5].map(n => `<span>${n}</span>`).join('')}</div>`;
}

export async function renderReadinessView() {
  const container = document.getElementById('readiness-content');
  const sessions = await getSessions();
  const mat = sessions.filter(s => sessionKind(s) === 'mat');
  const scored = scoredSessions(mat);

  if (scored.length < FLOOR) {
    container.innerHTML = belowFloor(scored.length, mat.length);
    return;
  }

  const sharp = pooledRate(scored, [4, 5]);
  const flat = pooledRate(scored, [1, 2]);
  const withRounds = mat.filter(s => s.readiness != null && s.rounds != null).length;

  container.innerHTML = `
    <div class="stat-strip">
      <div class="stat-tile">
        <span class="stat-num">${pct(sharp.pct)}</span>
        <span class="stat-label">focus reached · walking in at 4–5</span>
      </div>
      <div class="stat-tile">
        <span class="stat-num">${pct(flat.pct)}</span>
        <span class="stat-label">focus reached · walking in at 1–2</span>
      </div>
    </div>

    <div class="progress-section">
      <div class="progress-section-title">Focus reached, by readiness</div>
      ${rateRows(scored)}
    </div>

    ${withRounds >= 3 ? `
      <div class="progress-section">
        <div class="progress-section-head">
          <div class="progress-section-title">Rounds rolled, by readiness</div>
          <div class="year-since">AVG</div>
        </div>
        ${roundsChart(mat)}
      </div>` : ''}

    <div class="progress-section">
      <div class="readiness-note">
        ${scored.length} of ${mat.length} mat sessions carry both a readiness
        score and an active focus. The rest are excluded, not counted as zero.
      </div>
    </div>`;
}

export function initReadinessView() {
  return renderReadinessView();
}
