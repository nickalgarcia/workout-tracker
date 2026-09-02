// ── mat.js ──
// The mat session form and its save handler.

import { SCHEMA_VERSION, saveSession } from './db.js';
import {
  todayStr, showToast, watchFormDirty, clearFormDirty, navigate, selectToggle
} from './ui.js';

const VIEW = '#view-log-bjj';

function techniqueRowHTML() {
  return `
    <div class="technique-row">
      <input type="text" class="technique-input" placeholder="e.g. Rear naked choke, Guard pass, Hip escape..." />
      <button class="yt-btn" data-action="technique-yt" title="Search YouTube">▶</button>
      <button class="remove-btn" data-action="technique-remove">✕</button>
    </div>
    <div class="technique-link-row">
      <input type="url" class="technique-link-input" placeholder="Paste a video link to save (optional)" />
    </div>
  `;
}

function addTechniqueRow() {
  const list = document.getElementById('technique-list');
  const row = document.createElement('div');
  row.className = 'technique-row-wrapper';
  row.innerHTML = techniqueRowHTML();
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

async function saveMat() {
  const date = document.getElementById('bjj-date').value;
  if (!date) { showToast('Please select a date'); return; }
  const duration = document.getElementById('bjj-duration').value;
  if (!duration) { showToast('Please enter duration'); return; }

  const sessionType = document.getElementById('bjj-type').value;
  const techniques = collectTechniques();
  const notes = document.getElementById('bjj-notes').value.trim();

  const btn = document.getElementById('save-bjj-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    clearFormDirty();
    await saveSession({
      schemaVersion: SCHEMA_VERSION,
      type: 'mat',
      date,
      minutes: parseInt(duration),
      // The rebuilt mat form collects the rest. Until then these are
      // written empty rather than omitted, so every v2 doc has one shape.
      rounds: null,
      sessionType,
      positions: [],
      techniques,
      focusId: null,
      focusAttempted: null,
      worked: '',
      beat: '',
      readiness: null,
      notes
    });
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

/** Reset the form. Called on every navigation into the view. */
export function initMatForm() {
  document.getElementById('bjj-date').value = todayStr();
  document.getElementById('bjj-duration').value = '';
  document.getElementById('bjj-notes').value = '';
  document.getElementById('bjj-type').value = 'both';
  document.querySelectorAll(`${VIEW} .toggle-btn`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'both');
  });
  document.getElementById('technique-list').innerHTML = '';
  addTechniqueRow();
  watchFormDirty(['bjj-date', 'bjj-duration', 'bjj-notes']);
}

/** One-time listener wiring. Called once at boot. */
export function wireMat() {
  document.getElementById('add-technique-btn').addEventListener('click', addTechniqueRow);
  document.getElementById('save-bjj-btn').addEventListener('click', saveMat);

  document.querySelector(`${VIEW} .toggle-group`).addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (btn) selectToggle(btn, 'bjj-type');
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
