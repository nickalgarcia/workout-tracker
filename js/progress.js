// ── progress.js ──
// Mat progress first: the problem log, then position coverage. Support work
// is secondary and lives behind its own tab.

import { POSITIONS, getSessions } from './db.js';
import { escapeHtml, formatDate, sessionKind } from './ui.js';

// ── Date helpers ──

function daysAgo(dateStr, today = new Date()) {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split('-').map(Number);
  const then = new Date(y, m - 1, d);
  return Math.floor((today - then) / 86400000);
}

function within(sessions, days) {
  return sessions.filter(s => daysAgo(s.date) <= days);
}

// ── Problem log grouping ──
//
// Deliberately dumb: lowercase, strip punctuation, drop stopwords, then
// count how many ENTRIES contain each remaining word and each adjacent
// word pair. A pair beats its component words when the evidence is the
// same, because "posture break" reads better than "posture". Nothing is
// stemmed, nothing is inferred — if two entries say the same thing in
// different words they simply do not group, which is the honest outcome.

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','than','so','because','as','of',
  'to','in','on','at','by','for','with','from','into','onto','out','up','down',
  'i','me','my','he','she','they','them','his','her','their','it','its','you',
  'was','were','is','are','be','been','being','am','get','got','getting','go',
  'went','keep','kept','keeps','couldnt','cant','didnt','wasnt','doesnt','dont',
  'not','no','never','always','again','still','just','very','really','too',
  'when','while','after','before','during','every','time','times','times',
  'that','this','these','those','there','here','all','any','some','more','most',
  'had','have','has','do','did','does','one','two','felt','feel','feels',
]);

function significantWords(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Recurring themes across the problem log.
 * Returns [] when there is not enough signal to group honestly.
 */
export function groupThemes(entries) {
  // Below a handful of entries any grouping is noise dressed as insight.
  if (entries.length < 4) return [];

  const counts = new Map();          // phrase -> Set of entry indices
  const add = (phrase, i) => {
    if (!counts.has(phrase)) counts.set(phrase, new Set());
    counts.get(phrase).add(i);
  };

  entries.forEach((entry, i) => {
    const words = significantWords(entry.beat);
    new Set(words).forEach(w => add(w, i));
    for (let k = 0; k < words.length - 1; k++) add(`${words[k]} ${words[k + 1]}`, i);
  });

  const scored = [...counts.entries()]
    .map(([phrase, ids]) => ({ phrase, count: ids.size, ids }))
    .filter(t => t.count >= 2);

  // Prefer phrases over their component words. "posture break" and
  // "posture" and "break" would otherwise be three rows saying one thing,
  // and the phrase is the readable label. The pair's own count is reported
  // honestly, so it can be lower than the word's — that is the cost of
  // refusing to infer that "break his posture" and "posture break" are the
  // same thing. They are not grouped, by design.
  const pairs = scored.filter(t => t.phrase.includes(' '));
  const kept = scored.filter(t =>
    t.phrase.includes(' ') || !pairs.some(p => p.phrase.split(' ').includes(t.phrase))
  );

  return kept
    .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
    .slice(0, 5);
}

// ── Sections ──

function headlineStats(matSessions) {
  const last7 = within(matSessions, 7).length;
  const last30 = within(matSessions, 30).length;

  const rated = matSessions.filter(s => typeof s.readiness === 'number').slice(0, 10);
  const avg = rated.length
    ? (rated.reduce((sum, s) => sum + s.readiness, 0) / rated.length).toFixed(1)
    : null;

  return `
    <div class="stat-strip">
      <div class="stat-tile"><span class="stat-num">${last7}</span><span class="stat-label">mat · 7 days</span></div>
      <div class="stat-tile"><span class="stat-num">${last30}</span><span class="stat-label">mat · 30 days</span></div>
      <div class="stat-tile">
        <span class="stat-num">${avg ?? '—'}</span>
        <span class="stat-label">avg readiness${rated.length ? ` · last ${rated.length}` : ''}</span>
      </div>
    </div>`;
}

function problemLog(matSessions) {
  const entries = matSessions
    .filter(s => s.beat && s.beat.trim())
    .map(s => ({ beat: s.beat.trim(), date: s.date, positions: s.positions || [] }));

  if (entries.length === 0) {
    return `
      <div class="progress-section">
        <div class="progress-section-title">Problem log</div>
        <div class="progress-empty">Nothing logged yet. Fill in "what beat me" after a session and it collects here — this list is the curriculum.</div>
      </div>`;
  }

  const themes = groupThemes(entries);
  const themeBlock = themes.length
    ? `<div class="theme-list">
         ${themes.map(t => `
           <div class="theme-row">
             <span class="theme-phrase">${escapeHtml(t.phrase)}</span>
             <span class="theme-count">${t.count} times</span>
           </div>`).join('')}
       </div>`
    : `<div class="theme-none">Not enough repeated wording to group yet — the full list is below.</div>`;

  const list = entries.map(e => `
    <div class="problem-row">
      <div class="problem-text">${escapeHtml(e.beat)}</div>
      <div class="problem-meta">
        ${formatDate(e.date)}${e.positions.length ? ' · ' + e.positions.map(escapeHtml).join(' · ') : ''}
      </div>
    </div>`).join('');

  return `
    <div class="progress-section">
      <div class="progress-section-title">Problem log</div>
      ${themeBlock}
      <div class="problem-list">${list}</div>
    </div>`;
}

function positionCoverage(matSessions, days) {
  const recent = within(matSessions, days);
  const counts = new Map(POSITIONS.map(p => [p, 0]));
  recent.forEach(s => (s.positions || []).forEach(p => {
    if (counts.has(p)) counts.set(p, counts.get(p) + 1);
  }));

  const max = Math.max(1, ...counts.values());
  const bars = POSITIONS.map(p => {
    const n = counts.get(p);
    const pct = Math.round((n / max) * 100);
    return `
      <div class="coverage-row${n === 0 ? ' coverage-zero' : ''}">
        <div class="coverage-label">${p}</div>
        <div class="coverage-track"><div class="coverage-bar" style="width:${n === 0 ? 0 : Math.max(pct, 6)}%"></div></div>
        <div class="coverage-count">${n}</div>
      </div>`;
  }).join('');

  return `
    <div class="progress-section">
      <div class="progress-section-head">
        <div class="progress-section-title">Position coverage</div>
        <div class="range-toggle">
          <button class="range-btn${days === 30 ? ' active' : ''}" data-range="30">30d</button>
          <button class="range-btn${days === 90 ? ' active' : ''}" data-range="90">90d</button>
        </div>
      </div>
      <div class="coverage-list">${bars}</div>
    </div>`;
}

function supportWork(sessions) {
  const lifting = sessions.filter(s => sessionKind(s) === 'lifting');
  const cardio = sessions.filter(s => sessionKind(s) === 'cardio');

  const names = new Set();
  lifting.forEach(s => (s.exercises || []).forEach(e => { if (e.name) names.add(e.name); }));

  // Cardio minutes per week, last 8 weeks, most recent first.
  const weeks = [];
  for (let w = 0; w < 8; w++) {
    const mins = cardio
      .filter(s => { const d = daysAgo(s.date); return d >= w * 7 && d < (w + 1) * 7; })
      .reduce((sum, s) => sum + (s.minutes || 0), 0);
    weeks.push({ label: w === 0 ? 'This week' : `${w}w ago`, mins });
  }
  const maxMins = Math.max(1, ...weeks.map(w => w.mins));
  const cardioBlock = cardio.length === 0
    ? `<div class="progress-empty">No cardio logged yet.</div>`
    : `<div class="week-list">
         ${weeks.map(w => `
           <div class="week-row">
             <div class="week-label">${w.label}</div>
             <div class="coverage-track"><div class="coverage-bar cardio-bar" style="width:${w.mins ? Math.max(Math.round(w.mins / maxMins * 100), 6) : 0}%"></div></div>
             <div class="week-mins">${w.mins ? w.mins + 'm' : '—'}</div>
           </div>`).join('')}
       </div>`;

  return `
    <div class="progress-section">
      <div class="progress-section-title">Lifting</div>
      <select id="progress-exercise" class="field-input">
        <option value="">Select an exercise...</option>
        ${[...names].sort().map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')}
      </select>
      <div id="progress-exercise-table">
        ${lifting.length === 0
          ? `<div class="progress-empty">No lifting sessions yet.</div>`
          : `<div class="progress-empty">Select an exercise to see its history.</div>`}
      </div>
    </div>
    <div class="progress-section">
      <div class="progress-section-title">Cardio minutes per week</div>
      ${cardioBlock}
    </div>`;
}

/** The exercise history table — unchanged in logic from the old view. */
export async function renderExerciseTable() {
  const name = document.getElementById('progress-exercise').value;
  const container = document.getElementById('progress-exercise-table');
  if (!name) {
    container.innerHTML = `<div class="progress-empty">Select an exercise to see its history.</div>`;
    return;
  }

  const sessions = (await getSessions()).filter(s => sessionKind(s) === 'lifting');
  const data = sessions
    .map(s => {
      const ex = (s.exercises || []).find(e => e.name === name);
      if (!ex) return null;
      const bestSet = (ex.sets || []).reduce((best, set) =>
        parseFloat(set.weight) > parseFloat(best.weight || 0) ? set : best, {});
      return { date: s.date, sets: ex.sets, bestSet };
    })
    .filter(Boolean)
    .reverse();

  if (data.length === 0) {
    container.innerHTML = `<div class="progress-empty">No data found for ${escapeHtml(name)}.</div>`;
    return;
  }

  const maxWeight = Math.max(...data.map(d => parseFloat(d.bestSet.weight || 0)));
  const rows = data.map(d => {
    const w = parseFloat(d.bestSet.weight || 0);
    const isPR = w === maxWeight && maxWeight > 0;
    const totalSets = (d.sets || []).length;
    const totalReps = (d.sets || []).reduce((sum, s) => sum + (parseInt(s.reps) || 0), 0);
    return `
      <tr>
        <td>${formatDate(d.date)}</td>
        <td>${totalSets} × ${totalSets ? Math.round(totalReps / totalSets) : '—'}</td>
        <td>${w ? w + ' lbs' : '—'} ${isPR ? '<span class="pr-badge">PR</span>' : ''}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="progress-table">
      <thead><tr><th>Date</th><th>Sets × Reps</th><th>Best Weight</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── View ──

let tab = 'mat';
let coverageDays = 30;

export async function renderProgressView() {
  const container = document.getElementById('progress-content');
  container.innerHTML = '<div class="loading-state">Loading...</div>';

  const sessions = await getSessions();
  const matSessions = sessions.filter(s => sessionKind(s) === 'mat');

  container.innerHTML = `
    ${headlineStats(matSessions)}
    <div class="tab-row">
      <button class="tab-btn${tab === 'mat' ? ' active' : ''}" data-tab="mat">Mat</button>
      <button class="tab-btn${tab === 'support' ? ' active' : ''}" data-tab="support">Support</button>
    </div>
    ${tab === 'mat'
      ? problemLog(matSessions) + positionCoverage(matSessions, coverageDays)
      : supportWork(sessions)}
  `;
}

export function initProgressView() {
  return renderProgressView();
}

/** One-time listener wiring. Called once at boot. */
export function wireProgress() {
  document.getElementById('progress-content').addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab; renderProgressView(); return; }
    const rangeBtn = e.target.closest('[data-range]');
    if (rangeBtn) { coverageDays = Number(rangeBtn.dataset.range); renderProgressView(); }
  });

  // The exercise select is re-rendered with the support tab, so it is
  // reached by delegation rather than a direct listener.
  document.getElementById('progress-content').addEventListener('change', (e) => {
    if (e.target.id === 'progress-exercise') renderExerciseTable();
  });
}
