// ── mat.js ──
// The mat session form and its save handler.
//
// This form is optimised for one target: logging a session in under 45
// seconds, one-handed, on a phone, in a gym parking lot. Everything here
// follows from that — tap targets over typing, nothing modal, and only
// date and minutes are allowed to block a save.

import { SCHEMA_VERSION, POSITIONS, saveSession } from './db.js';
import {
  todayStr, showToast, watchFormDirty, clearFormDirty, markFormDirty,
  navigate, selectToggle
} from './ui.js';
import { loadActiveFocus, currentFocus } from './focus.js';

// Last minutes value, offered as the placeholder next time. Sessions tend to
// be the same length every week, so this is usually the right answer already.
const LAST_MINUTES_KEY = 'matlog:lastMinutes';

function lastMinutes() {
  try { return localStorage.getItem(LAST_MINUTES_KEY) || ''; } catch { return ''; }
}

function rememberMinutes(value) {
  try { localStorage.setItem(LAST_MINUTES_KEY, String(value)); } catch { /* private mode */ }
}

// ── Techniques ──

function addTechniqueRow() {
  const list = document.getElementById('technique-list');
  const row = document.createElement('div');
  row.className = 'technique-row-wrapper';
  row.innerHTML = `
    <div class="technique-row">
      <input type="text" class="technique-input" placeholder="e.g. Rear naked choke, Guard pass, Hip escape..." />
      <button class="yt-btn" data-action="technique-yt" title="Search YouTube">▶</button>
      <button class="remove-btn" data-action="technique-remove">✕</button>
    </div>
    <div class="technique-link-row">
      <input type="url" class="technique-link-input" placeholder="Paste a video link to save (optional)" />
    </div>
  `;
  list.appendChild(row);
  if (list.children.length > 1) row.querySelector('.technique-input').focus();
}

function openTechniqueYT(btn) {
  const name = btn.closest('.technique-row').querySelector('.technique-input')?.value.trim() || '';
  if (!name) { showToast('Enter a technique first'); return; }
  window.open(
    `https://www.youtube.com/results?search_query=${encodeURIComponent('BJJ ' + name + ' tutorial')}`,
    '_blank'
  );
}

function removeTechniqueRow(btn) {
  const list = document.getElementById('technique-list');
  const wrapper = btn.closest('.technique-row-wrapper');
  // Never leave the list empty — clear the last row instead of removing it.
  if (list.children.length > 1) wrapper.remove();
  else wrapper.querySelector('.technique-input').value = '';
}

function collectTechniques() {
  return Array.from(document.querySelectorAll('.technique-row-wrapper'))
    .map(wrapper => {
      const name = wrapper.querySelector('.technique-input')?.value.trim() || '';
      const link = wrapper.querySelector('.technique-link-input')?.value.trim() || '';
      if (!name) return null;
      return link ? { name, link } : { name };
    })
    .filter(Boolean);
}

// ── Positions ──
// Rendered from the POSITIONS constant so the vocabulary has one source of
// truth. Chips, not a dropdown: tapping is faster than scrolling a select,
// and multi-select is the point.

function renderPositionChips() {
  document.getElementById('mat-positions').innerHTML = POSITIONS
    .map((p, i) => `<button class="chip" data-position-index="${i}">${p}</button>`)
    .join('');
}

function selectedPositions() {
  return Array.from(document.querySelectorAll('#mat-positions .chip.active'))
    .map(el => POSITIONS[Number(el.dataset.positionIndex)])
    .filter(Boolean);
}

// ── Save ──

async function saveMat() {
  const date = document.getElementById('mat-date').value;
  if (!date) { showToast('Please select a date'); return; }

  // Minutes falls back to the remembered value, so the placeholder the user
  // is looking at is what actually gets saved if they leave it alone.
  const minutesInput = document.getElementById('mat-minutes').value.trim();
  const minutes = parseInt(minutesInput || lastMinutes());
  if (!minutes) { showToast('How long was the session?'); return; }

  // Nothing below this line can block the save.
  const roundsInput = document.getElementById('mat-rounds').value.trim();
  const readinessInput = document.getElementById('mat-readiness').value;
  const focus = currentFocus();

  const btn = document.getElementById('save-mat-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    clearFormDirty();
    await saveSession({
      schemaVersion: SCHEMA_VERSION,
      type: 'mat',
      date,
      minutes,
      rounds: roundsInput ? parseInt(roundsInput) : null,
      sessionType: document.getElementById('mat-type').value,
      positions: selectedPositions(),
      techniques: collectTechniques(),
      focusId: focus?.id ?? null,
      focusAttempted: document.getElementById('mat-focus-attempted').value || null,
      worked: document.getElementById('mat-worked').value.trim(),
      beat: document.getElementById('mat-beat').value.trim(),
      readiness: readinessInput ? parseInt(readinessInput) : null,
      notes: document.getElementById('mat-notes').value.trim(),
    });
    rememberMinutes(minutes);
    showToast('Mat session logged! 🥋');
    navigate('dashboard');
  } catch (e) {
    console.error(e);
    showToast('Error saving. Try again.');
  } finally {
    btn.textContent = 'Save Session';
    btn.disabled = false;
  }
}

// ── Init ──

/**
 * Show the active focus above the yes/partly/no buttons, or hide the whole
 * field when no focus is set — there is nothing to answer about.
 */
async function initFocusField() {
  const focus = await loadActiveFocus();
  document.getElementById('mat-focus-section').classList.toggle('hidden', !focus);
  document.getElementById('mat-focus-attempted').value = '';
  document.querySelectorAll('#mat-focus-toggle .toggle-btn')
    .forEach(b => b.classList.remove('active'));
  if (focus) document.getElementById('mat-focus-title').textContent = focus.title;
}

/** Reset the form. Called on every navigation into the view. */
export async function initMatForm() {
  document.getElementById('mat-date').value = todayStr();

  const minutes = document.getElementById('mat-minutes');
  minutes.value = '';
  minutes.placeholder = lastMinutes() || 'e.g. 90';

  document.getElementById('mat-rounds').value = '';
  document.getElementById('mat-worked').value = '';
  document.getElementById('mat-beat').value = '';
  document.getElementById('mat-notes').value = '';

  document.getElementById('mat-readiness').value = '';
  document.querySelectorAll('#mat-readiness-row .readiness-btn')
    .forEach(b => b.classList.remove('active'));

  document.getElementById('mat-type').value = 'both';
  document.querySelectorAll('#mat-type-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'both');
  });

  renderPositionChips();

  document.getElementById('technique-list').innerHTML = '';
  addTechniqueRow();

  // Notes start collapsed so they are not in the way of the fast path.
  document.getElementById('mat-notes').classList.add('hidden');
  document.getElementById('mat-notes-toggle').classList.remove('hidden');

  watchFormDirty(['mat-date', 'mat-minutes', 'mat-rounds', 'mat-worked', 'mat-beat', 'mat-notes']);
  await initFocusField();
}

/** One-time listener wiring. Called once at boot. */
export function wireMat() {
  document.getElementById('add-technique-btn').addEventListener('click', addTechniqueRow);
  document.getElementById('save-mat-btn').addEventListener('click', saveMat);

  document.getElementById('mat-type-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (btn) selectToggle(btn, 'mat-type');
  });

  document.getElementById('mat-focus-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (btn) { selectToggle(btn, 'mat-focus-attempted'); markFormDirty(); }
  });

  document.getElementById('mat-readiness-row').addEventListener('click', (e) => {
    const btn = e.target.closest('.readiness-btn');
    if (!btn) return;
    document.querySelectorAll('#mat-readiness-row .readiness-btn')
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mat-readiness').value = btn.dataset.value;
    markFormDirty();
  });

  // Chips toggle independently — this is a multi-select, not a radio group.
  document.getElementById('mat-positions').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    chip.classList.toggle('active');
    markFormDirty();
  });

  document.getElementById('mat-notes-toggle').addEventListener('click', (e) => {
    e.currentTarget.classList.add('hidden');
    const notes = document.getElementById('mat-notes');
    notes.classList.remove('hidden');
    notes.focus();
  });

  // Technique rows are created dynamically, so their buttons are handled by
  // one delegated listener on the list rather than per-row handlers.
  document.getElementById('technique-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'technique-yt') openTechniqueYT(btn);
    if (btn.dataset.action === 'technique-remove') removeTechniqueRow(btn);
  });
}
