// ── year.js ──
// Two years of showing up. A day grid, Monday-first, one cell per day.
//
// This is the browse surface for past sessions: the flat history list
// cannot show rhythm or gaps, and those are most of what a training log
// is for. Tapping a day fills the detail line rather than navigating —
// the grid never moves under you. The detail line itself opens the
// session.

import { getSessions } from './db.js';
import { escapeHtml, formatDate, sessionKind, openDetail } from './ui.js';

const DAY_MS = 86400000;

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** date -> 'mat' | 'support' | 'both', for every day that has a session. */
function buildDayMap(sessions) {
  const map = new Map();
  sessions.forEach(s => {
    if (!s.date) return;
    const kind = sessionKind(s) === 'mat' ? 'mat' : 'support';
    const seen = map.get(s.date);
    map.set(s.date, !seen || seen === kind ? kind : 'both');
  });
  return map;
}

// ── Stats ──

function longestGap(dayMap, firstDate, today) {
  if (!firstDate) return null;
  let worst = { days: 0, from: null, to: null };
  let runStart = null;
  for (let t = parseISO(firstDate).getTime(); t <= today.getTime(); t += DAY_MS) {
    const iso = toISO(new Date(t));
    if (dayMap.has(iso)) {
      if (runStart !== null) {
        const days = Math.round((t - runStart) / DAY_MS);
        if (days > worst.days) {
          worst = { days, from: toISO(new Date(runStart)), to: toISO(new Date(t - DAY_MS)) };
        }
        runStart = null;
      }
    } else if (runStart === null) {
      runStart = t;
    }
  }
  if (runStart !== null) {
    const days = Math.round((today.getTime() + DAY_MS - runStart) / DAY_MS);
    if (days > worst.days) {
      worst = { days, from: toISO(new Date(runStart)), to: toISO(today) };
    }
  }
  return worst.days ? worst : null;
}

function busiestMonth(dayMap) {
  const months = {};
  for (const iso of dayMap.keys()) {
    const key = iso.slice(0, 7);
    months[key] = (months[key] || 0) + 1;
  }
  const best = Object.entries(months).sort((a, b) => b[1] - a[1])[0];
  if (!best) return null;
  const [y, m] = best[0].split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return { name, days: best[1] };
}

// ── Grid ──

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/**
 * A 53x7 grid for one calendar year, laid out column by column so each
 * column is a week and each row a weekday. Sized in fr units rather than
 * fixed pixels — a 6px cell overflows a 430px phone once the day labels
 * and padding are counted.
 */
function yearGrid(year, dayMap, firstDate, todayISO, selected) {
  const jan1 = new Date(year, 0, 1);
  const start = new Date(jan1);
  start.setDate(start.getDate() - ((jan1.getDay() + 6) % 7));   // back to Monday

  const cells = [];
  const monthCol = {};
  for (let c = 0; c < 53; c++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(d.getDate() + c * 7 + r);
      if (d.getFullYear() !== year) { cells.push('<i class="yc yc-void"></i>'); continue; }
      if (d.getDate() === 1) monthCol[d.getMonth()] = c;

      const iso = toISO(d);
      const kind = dayMap.get(iso);
      const before = firstDate && iso < firstDate;
      const future = iso > todayISO;
      let cls = 'yc';
      if (before || future) cls += ' yc-void';
      else if (kind) cls += ' yc-' + kind;
      else cls += ' yc-rest';
      if (iso === selected) cls += ' yc-selected';
      else if (iso === todayISO) cls += ' yc-today';
      const tappable = !before && !future;
      cells.push(`<i class="${cls}"${tappable ? ` data-day="${iso}"` : ''}></i>`);
    }
  }

  // Ticks share the grid's column template, so a month label lands exactly
  // over the column holding the 1st. Positioning them by percentage drifts
  // once the weekday gutter is in the same track list.
  const ticks = Object.entries(monthCol)
    .map(([m, c]) => `<span class="year-tick" style="grid-column:${Number(c) + 2}">${MONTHS[m]}</span>`)
    .join('');

  // The weekday labels are the first seven grid items, so they occupy
  // column 1 and are laid out by the same rows as the cells. As a separate
  // flex column they stretched independently and drifted out of line.
  const dows = ['M', '', 'W', '', 'F', '', 'S']
    .map(d => `<span class="year-dow">${d}</span>`).join('');

  return `
    <div class="year-grid-col">
      <div class="year-ticks">${ticks}</div>
      <div class="year-grid">${dows}${cells.join('')}</div>
    </div>`;
}

function yearSummary(year, dayMap, sessions) {
  const inYear = [...dayMap.entries()].filter(([iso]) => iso.startsWith(String(year)));
  if (inYear.length === 0) return '';
  const mat = inYear.filter(([, k]) => k === 'mat').length;
  const support = inYear.filter(([, k]) => k === 'support').length;
  const both = inYear.filter(([, k]) => k === 'both').length;
  return `
    <div class="year-summary">
      <span class="year-summary-lead">${inYear.length} DAYS</span>
      <span>MAT ${mat + both}</span>
      <span>SUPPORT ${support + both}</span>
      ${both ? `<span>BOTH ${both}</span>` : ''}
    </div>`;
}

// ── Detail line ──

let selectedDay = null;
let cache = { sessions: [], dayMap: new Map() };

function detailLine() {
  if (!selectedDay) {
    return `
      <div class="year-detail">
        <div class="year-detail-label">NO DAY SELECTED</div>
        <div class="year-detail-body">Tap any mark for that day.</div>
      </div>`;
  }

  const onDay = cache.sessions.filter(s => s.date === selectedDay);
  const long = parseISO(selectedDay)
    .toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase();

  if (onDay.length === 0) {
    return `
      <div class="year-detail">
        <div class="year-detail-head">
          <div class="year-detail-label is-live">${long}</div>
          <div class="year-detail-meta">REST</div>
        </div>
        <div class="year-detail-body">Nothing logged. Rest is part of the rhythm.</div>
      </div>`;
  }

  const minutes = onDay.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const kinds = [...new Set(onDay.map(s => (sessionKind(s) === 'mat' ? 'MAT' : 'SUPPORT')))].join(' + ');
  const summary = onDay.map(s => {
    if (sessionKind(s) === 'mat') {
      const pos = (s.positions || []).length ? s.positions.join(', ') : 'Mat session';
      return escapeHtml(pos);
    }
    if (sessionKind(s) === 'cardio') return escapeHtml(`${s.cardioType || 'Cardio'}`);
    return escapeHtml((s.exercises || []).map(e => e.name).slice(0, 3).join(', ') || 'Lifting');
  }).join(' · ');

  return `
    <button class="year-detail is-tappable" data-open-session="${onDay[0].id}">
      <div class="year-detail-head">
        <div class="year-detail-label is-live">${long}</div>
        <div class="year-detail-meta">${kinds}${minutes ? ` · ${minutes} MIN` : ''}</div>
      </div>
      <div class="year-detail-body">${summary}</div>
    </button>`;
}

// ── View ──

export async function renderYearView() {
  const container = document.getElementById('year-content');
  const sessions = await getSessions();
  const dayMap = buildDayMap(sessions);
  cache = { sessions, dayMap };

  if (sessions.length === 0) {
    container.innerHTML = `<div class="empty-state">Nothing logged yet. Every session you save fills in a day here.</div>`;
    return;
  }

  const today = new Date();
  const todayISO = toISO(today);
  const dates = [...dayMap.keys()].sort();
  const firstDate = dates[0];

  const matDays = [...dayMap.values()].filter(k => k === 'mat' || k === 'both').length;
  const supportDays = [...dayMap.values()].filter(k => k === 'support' || k === 'both').length;
  const weeks = Math.max(1, Math.round((today - parseISO(firstDate)) / (DAY_MS * 7)));

  const years = [];
  for (let y = today.getFullYear(); y >= parseISO(firstDate).getFullYear(); y--) years.push(y);

  const gap = longestGap(dayMap, firstDate, today);
  const busiest = busiestMonth(dayMap);
  const matPerWeek = (matDays / weeks).toFixed(1);

  container.innerHTML = `
    <div class="year-accum">
      <div class="year-accum-head">
        <span class="progress-section-title">Accumulation</span>
        <span class="year-since">SINCE ${formatDate(firstDate).toUpperCase()} · ${weeks} WEEKS</span>
      </div>
      <div class="year-accum-row">
        <div class="year-big">${dayMap.size}</div>
        <div class="year-accum-side">
          <div class="stat-label">DAYS TRAINED</div>
          <div class="year-accum-split">${matDays} mat · ${supportDays} support</div>
        </div>
      </div>
    </div>

    <div id="year-detail-slot">${detailLine()}</div>

    ${years.map(y => `
      <div class="year-block">
        <div class="year-block-head">
          <span class="year-block-title">${y}</span>
          <span class="year-since">${y === today.getFullYear() ? `THROUGH ${formatDate(todayISO).toUpperCase()}` : ''}</span>
        </div>
        ${yearGrid(y, dayMap, firstDate, todayISO, selectedDay)}
        ${yearSummary(y, dayMap, sessions)}
      </div>`).join('')}

    <div class="year-legend">
      <span><i class="yc yc-mat"></i>MAT</span>
      <span><i class="yc yc-support"></i>SUPPORT</span>
      <span><i class="yc yc-both"></i>BOTH</span>
      <span><i class="yc yc-rest"></i>REST</span>
      <span class="is-live"><i class="yc yc-mat yc-selected"></i>SELECTED</span>
    </div>

    <div class="year-stats">
      ${gap ? `<div class="year-stat-row"><span class="stat-label">LONGEST GAP</span><span class="year-stat-val">${gap.days} days <em>${formatDate(gap.from).toUpperCase()}</em></span></div>` : ''}
      ${busiest ? `<div class="year-stat-row"><span class="stat-label">BUSIEST MONTH</span><span class="year-stat-val">${busiest.name} <em>${busiest.days} DAYS</em></span></div>` : ''}
      <div class="year-stat-row"><span class="stat-label">MAT PER WEEK</span><span class="year-stat-val">${matPerWeek} <em>AVG</em></span></div>
    </div>`;
}

export function initYearView() {
  selectedDay = null;
  return renderYearView();
}

/** Repaint only the detail line and the selected cell — a full re-render
 *  would scroll the grid back to the top on every tap. */
function selectDay(iso) {
  selectedDay = iso;
  document.getElementById('year-detail-slot').innerHTML = detailLine();
  document.querySelectorAll('#year-content .yc-selected')
    .forEach(el => el.classList.remove('yc-selected'));
  document.querySelector(`#year-content .yc[data-day="${iso}"]`)?.classList.add('yc-selected');
}

/** One-time listener wiring. Called once at boot. */
export function wireYear() {
  document.getElementById('year-content').addEventListener('click', (e) => {
    const cell = e.target.closest('.yc[data-day]');
    if (cell) { selectDay(cell.dataset.day); return; }
    const open = e.target.closest('[data-open-session]');
    if (open) openDetail(open.dataset.openSession);
  });
}
