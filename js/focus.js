// ── focus.js ──
// The current focus: the dashboard card, the focus view with its history,
// and the flows for editing one or ending it and starting the next.

import {
  getActiveFocus, setActiveFocus, replaceFocus, getFocusArchive,
  newFocusId, getSessions
} from './db.js';
import { escapeHtml, formatDate, showToast, todayStr, sessionKind } from './ui.js';

// Cached so the mat form can stamp focusId without another read.
let activeFocus = null;

export function currentFocus() {
  return activeFocus;
}

export async function loadActiveFocus() {
  activeFocus = await getActiveFocus();
  return activeFocus;
}

// ── Stats ──

/** Whole weeks a focus has been running, minimum 1. */
export function weeksActive(focus, today = new Date()) {
  if (!focus?.startedAt) return 0;
  const [y, m, d] = focus.startedAt.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = focus.endedAt
    ? (([ey, em, ed]) => new Date(ey, em - 1, ed))(focus.endedAt.split('-').map(Number))
    : today;
  const days = Math.floor((end - start) / 86400000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

/**
 * How often a focus was actually reached.
 *
 * Denominator: mat sessions stamped with this focus. Numerator: those where
 * focusAttempted is 'yes' or 'partly' — "partly" counts, because getting
 * partway to the thing you were working on is not the same as not trying.
 */
export function attemptStats(focus, sessions) {
  if (!focus) return { attempted: 0, total: 0 };
  const mine = sessions.filter(s => sessionKind(s) === 'mat' && s.focusId === focus.id);
  const attempted = mine.filter(s => s.focusAttempted === 'yes' || s.focusAttempted === 'partly');
  return { attempted: attempted.length, total: mine.length };
}

function attemptLine(stats) {
  if (stats.total === 0) return 'No sessions logged against it yet';
  return `Attempted in ${stats.attempted} of ${stats.total} session${stats.total === 1 ? '' : 's'}`;
}

// ── Dashboard card ──

/** Rendered into the dashboard by ui.js. Registered in main.js. */
export async function renderFocusCard(container, sessions) {
  const focus = await loadActiveFocus();

  if (!focus) {
    container.innerHTML = `
      <button class="focus-card focus-card-empty" data-navigate="focus">
        <div class="focus-card-label">CURRENT FOCUS</div>
        <div class="focus-card-title">Nothing set yet</div>
        <div class="focus-card-meta">Tap to pick what you're working on</div>
      </button>`;
    return;
  }

  const stats = attemptStats(focus, sessions);
  const weeks = weeksActive(focus);
  container.innerHTML = `
    <button class="focus-card" data-navigate="focus">
      <div class="focus-card-label">CURRENT FOCUS</div>
      <div class="focus-card-title">${escapeHtml(focus.title)}</div>
      <div class="focus-card-meta">
        <span>Week ${weeks}</span>
        <span class="focus-card-dot">·</span>
        <span>${attemptLine(stats)}</span>
      </div>
    </button>`;
}

// ── Focus view ──

function focusFormHTML({ heading, title = '', description = '', submitLabel, cancel = true }) {
  return `
    <div class="focus-form">
      <div class="focus-form-heading">${heading}</div>
      <input type="text" id="focus-title" class="field-input" placeholder="e.g. Closed guard: overhook + head control"
             value="${escapeHtml(title)}" />
      <textarea id="focus-description" class="field-input field-textarea"
                placeholder="What are you actually trying to do? Where does it branch?">${escapeHtml(description)}</textarea>
      <div class="focus-form-actions">
        ${cancel ? `<button class="focus-btn-secondary" data-action="focus-cancel">Cancel</button>` : ''}
        <button class="focus-btn-primary" data-action="focus-save">${submitLabel}</button>
      </div>
    </div>`;
}

function archiveRowHTML(focus, sessions) {
  const stats = attemptStats(focus, sessions);
  const range = `${formatDate(focus.startedAt)} – ${focus.endedAt ? formatDate(focus.endedAt) : 'present'}`;
  return `
    <div class="focus-past">
      <div class="focus-past-title">${escapeHtml(focus.title)}</div>
      <div class="focus-past-range">${range} · ${weeksActive(focus)} weeks</div>
      <div class="focus-past-rate">${attemptLine(stats)}</div>
      ${focus.description ? `<div class="focus-past-desc">${escapeHtml(focus.description)}</div>` : ''}
    </div>`;
}

/** mode: 'view' | 'edit' | 'new' */
let mode = 'view';

export async function renderFocusView() {
  const container = document.getElementById('focus-content');
  container.innerHTML = '<div class="loading-state">Loading...</div>';

  const [focus, sessions, archive] = await Promise.all([
    loadActiveFocus(), getSessions(), getFocusArchive()
  ]);

  // No focus yet, or explicitly starting one — show the form on its own.
  if (!focus || mode === 'new') {
    container.innerHTML = focusFormHTML({
      heading: focus ? 'Start a new focus' : 'What are you working on?',
      submitLabel: focus ? 'Start this focus' : 'Set focus',
      cancel: !!focus,
    }) + historySection(archive, sessions);
    return;
  }

  if (mode === 'edit') {
    container.innerHTML = focusFormHTML({
      heading: 'Edit focus',
      title: focus.title,
      description: focus.description,
      submitLabel: 'Save',
    }) + historySection(archive, sessions);
    return;
  }

  const stats = attemptStats(focus, sessions);
  container.innerHTML = `
    <div class="focus-active">
      <div class="focus-card-label">CURRENT FOCUS</div>
      <div class="focus-active-title">${escapeHtml(focus.title)}</div>
      ${focus.description ? `<div class="focus-active-desc">${escapeHtml(focus.description)}</div>` : ''}
      <div class="focus-active-stats">
        <div><span class="focus-stat-num">${weeksActive(focus)}</span><span class="focus-stat-label">weeks in</span></div>
        <div><span class="focus-stat-num">${stats.attempted}/${stats.total}</span><span class="focus-stat-label">sessions attempted</span></div>
      </div>
      <div class="focus-active-since">Started ${formatDate(focus.startedAt)}</div>
      <div class="focus-form-actions">
        <button class="focus-btn-secondary" data-action="focus-edit">Edit</button>
        <button class="focus-btn-primary" data-action="focus-end">End this focus / Start a new one</button>
      </div>
    </div>
    ${historySection(archive, sessions)}`;
}

function historySection(archive, sessions) {
  if (archive.length === 0) return '';
  return `
    <div class="focus-history">
      <div class="focus-history-title">Past focuses</div>
      ${archive.map(f => archiveRowHTML(f, sessions)).join('')}
    </div>`;
}

// ── Actions ──

async function saveFromForm() {
  const title = document.getElementById('focus-title').value.trim();
  if (!title) { showToast('Give the focus a title'); return; }
  const description = document.getElementById('focus-description').value.trim();

  try {
    if (mode === 'edit') {
      await setActiveFocus({ ...activeFocus, title, description });
      showToast('Focus updated');
    } else {
      const next = {
        id: newFocusId(),
        title,
        description,
        startedAt: todayStr(),
        endedAt: null,
        active: true,
      };
      // Archives the outgoing focus, if there is one, before switching.
      await replaceFocus(activeFocus, todayStr(), next);
      showToast(activeFocus ? 'New focus started' : 'Focus set');
    }
    mode = 'view';
    await renderFocusView();
  } catch (e) {
    console.error(e);
    showToast('Error saving focus. Try again.');
  }
}

export function initFocusView() {
  mode = 'view';
  return renderFocusView();
}

/** One-time listener wiring. Called once at boot. */
export function wireFocus() {
  document.getElementById('focus-content').addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'focus-save') saveFromForm();
    if (action === 'focus-edit') { mode = 'edit'; renderFocusView(); }
    if (action === 'focus-end') { mode = 'new'; renderFocusView(); }
    if (action === 'focus-cancel') { mode = 'view'; renderFocusView(); }
  });
}
