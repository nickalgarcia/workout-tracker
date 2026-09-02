// ── support.js ──
// Support work: the lifting and cardio forms and their save handlers.

import { SCHEMA_VERSION, saveSession } from './db.js';
import {
  todayStr, showToast, watchFormDirty, clearFormDirty, navigate, selectToggle, escapeHtml
} from './ui.js';

// ── Lifting ──

const TRAINING_PLANS = {
  day1: {
    label: 'Day 1 — Push/Legs',
    exercises: [
      'Goblet Squat', 'Dumbbell Floor Press', 'Dumbbell Shoulder Press',
      'Push Up', 'Dumbbell Lunge', 'Overhead Tricep Extension', 'Dead Bug',
    ]
  },
  day2: {
    label: 'Day 2 — Pull/Hinge',
    exercises: [
      'Romanian Deadlift', 'Dumbbell Row', 'Pull Up', 'Bicep Curl',
      'Lateral Raise', 'Dumbbell Rear Delt Fly', 'Russian Twist',
    ]
  },
  blank: { label: 'Free Session', exercises: [] }
};

const PRESET_EXERCISES = [
  'Goblet Squat', 'Dumbbell Squat', 'Romanian Deadlift', 'Dumbbell Lunge',
  'Bulgarian Split Squat', 'Step Up', 'Dumbbell Floor Press', 'Dumbbell Bench Press',
  'Push Up', 'Dumbbell Shoulder Press', 'Lateral Raise', 'Front Raise',
  'Dumbbell Row', 'Renegade Row', 'Pull Up', 'Inverted Row',
  'Bicep Curl', 'Hammer Curl', 'Tricep Kickback', 'Overhead Tricep Extension',
  'Dumbbell Deadlift', 'Farmers Carry', 'Hip Thrust', 'Glute Bridge',
  'Plank', 'Dead Bug', 'Russian Twist', 'Dumbbell Crunch',
  '-- Custom --'
];

const CUSTOM = '-- Custom --';

let exerciseRowCount = 0;

function selectPlan(btn) {
  document.querySelectorAll('.plan-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const plan = btn.dataset.plan;
  document.getElementById('selected-plan').value = plan;
  loadPlanExercises(plan);
}

function loadPlanExercises(planKey) {
  const plan = TRAINING_PLANS[planKey];
  document.getElementById('exercise-list').innerHTML = '';
  exerciseRowCount = 0;

  if (plan.exercises.length === 0) buildExerciseRow();
  else plan.exercises.forEach(name => buildExerciseRow(name, 3));
}

// Builds one exercise row. `name` preselects an exercise (plan rows);
// `setCount` is how many blank set rows to start with — 3 for plan
// exercises, 1 for a row added by hand.
function buildExerciseRow(name = '', setCount = 1) {
  exerciseRowCount++;
  const id = exerciseRowCount;
  const list = document.getElementById('exercise-list');
  const options = PRESET_EXERCISES
    .map(n => `<option value="${escapeHtml(n)}"${n === name ? ' selected' : ''}>${escapeHtml(n)}</option>`)
    .join('');
  const row = document.createElement('div');
  row.className = 'exercise-row';
  row.id = `exercise-row-${id}`;
  row.dataset.rowId = id;
  row.innerHTML = `
    <div class="exercise-row-top">
      <select class="exercise-select" id="exercise-select-${id}" data-action="exercise-select">
        <option value="">Pick exercise...</option>
        ${options}
      </select>
      <button class="yt-btn" data-action="exercise-yt" title="Search YouTube">▶</button>
      <button class="remove-btn" data-action="exercise-remove">✕</button>
    </div>
    <div id="custom-name-wrapper-${id}" style="display:none; margin-bottom:10px;">
      <input type="text" class="exercise-name-input" id="custom-name-${id}" placeholder="Exercise name..." style="width:100%;" />
    </div>
    <div class="sets-grid">
      <span>Set</span><span>Reps</span><span>Weight (lbs)</span><span></span>
    </div>
    <div id="sets-${id}"></div>
    <button class="add-set-btn" data-action="set-add">+ Add Set</button>
  `;
  list.appendChild(row);
  for (let i = 0; i < setCount; i++) addSetRow(id);
}

function rowIdOf(el) {
  return el.closest('.exercise-row')?.dataset.rowId;
}

/** The chosen exercise name, resolving the "-- Custom --" case. */
function exerciseNameFor(id) {
  const value = document.getElementById(`exercise-select-${id}`)?.value || '';
  if (value !== CUSTOM) return value;
  return document.getElementById(`custom-name-${id}`)?.value.trim() || '';
}

function openExerciseYT(id) {
  const name = exerciseNameFor(id);
  if (!name) { showToast('Pick an exercise first'); return; }
  window.open(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' proper form tutorial')}`,
    '_blank'
  );
}

function handleExerciseSelect(id) {
  const select = document.getElementById(`exercise-select-${id}`);
  const wrapper = document.getElementById(`custom-name-wrapper-${id}`);
  if (select.value === CUSTOM) {
    wrapper.style.display = 'block';
    document.getElementById(`custom-name-${id}`).focus();
  } else {
    wrapper.style.display = 'none';
  }
}

function addSetRow(exerciseId) {
  const container = document.getElementById(`sets-${exerciseId}`);
  const setNum = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'set-row';
  row.innerHTML = `
    <input class="set-input" type="text" value="${setNum}" readonly style="color:var(--text-muted);" />
    <input class="set-input" type="number" placeholder="—" min="1" />
    <input class="set-input" type="number" placeholder="—" min="0" step="2.5" />
    <button class="remove-btn" data-action="set-remove">✕</button>
  `;
  container.appendChild(row);
}

function removeSetRow(btn, exerciseId) {
  btn.closest('.set-row').remove();
  // Renumber the remaining sets so the labels stay 1..n.
  document.querySelectorAll(`#sets-${exerciseId} .set-row`).forEach((row, i) => {
    row.querySelector('.set-input').value = i + 1;
  });
}

function collectExercises() {
  const exercises = [];
  document.querySelectorAll('.exercise-row').forEach(row => {
    const id = row.dataset.rowId;
    if (!id) return;
    const name = exerciseNameFor(id);
    if (!name) return;
    const sets = [];
    document.querySelectorAll(`#sets-${id} .set-row`).forEach(setRow => {
      const inputs = setRow.querySelectorAll('input[type="number"]');
      const reps = inputs[0]?.value || '';
      const weight = inputs[1]?.value || '';
      if (reps || weight) sets.push({ reps, weight });
    });
    exercises.push({ name, sets });
  });
  return exercises;
}

async function saveLifting() {
  const date = document.getElementById('lifting-date').value;
  if (!date) { showToast('Please select a date'); return; }
  const exercises = collectExercises();
  if (exercises.length === 0) { showToast('Add at least one exercise'); return; }
  const notes = document.getElementById('lifting-notes').value.trim();

  const btn = document.getElementById('save-lifting-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    clearFormDirty();
    await saveSession({
      schemaVersion: SCHEMA_VERSION,
      type: 'support',
      subtype: 'lifting',
      date,
      minutes: null,          // the lifting form has no duration input yet
      exercises,
      cardioType: null,
      distance: null,
      distanceUnit: null,
      notes
    });
    showToast('Session saved! 💪');
    navigate('dashboard');
  } catch (e) {
    console.error(e);
    showToast('Error saving. Try again.');
  } finally {
    btn.textContent = 'Save Session';
    btn.disabled = false;
  }
}

export function initLiftingForm() {
  document.getElementById('lifting-date').value = todayStr();
  document.getElementById('lifting-notes').value = '';
  document.getElementById('exercise-list').innerHTML = '';
  exerciseRowCount = 0;

  document.querySelectorAll('.plan-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.plan === 'day1');
  });
  document.getElementById('selected-plan').value = 'day1';
  loadPlanExercises('day1');
  watchFormDirty(['lifting-date', 'lifting-notes']);
}

// ── Cardio ──

async function saveCardio() {
  const date = document.getElementById('cardio-date').value;
  if (!date) { showToast('Please select a date'); return; }
  const duration = document.getElementById('cardio-duration').value;
  if (!duration) { showToast('Please enter duration'); return; }
  const cardioType = document.getElementById('cardio-type').value;
  const distance = document.getElementById('cardio-distance').value;
  const distanceUnit = document.getElementById('cardio-distance-unit').value;
  const notes = document.getElementById('cardio-notes').value.trim();

  const btn = document.getElementById('save-cardio-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;
  try {
    clearFormDirty();
    await saveSession({
      schemaVersion: SCHEMA_VERSION,
      type: 'support',
      subtype: 'cardio',
      date,
      minutes: parseInt(duration),
      exercises: [],
      cardioType,
      distance: distance ? parseFloat(distance) : null,
      distanceUnit: distance ? distanceUnit : null,
      notes
    });
    showToast('Cardio logged! 🏃');
    navigate('dashboard');
  } catch (e) {
    console.error(e);
    showToast('Error saving. Try again.');
  } finally {
    btn.textContent = 'Save Session';
    btn.disabled = false;
  }
}

export function initCardioForm() {
  document.getElementById('cardio-date').value = todayStr();
  document.getElementById('cardio-duration').value = '';
  document.getElementById('cardio-distance').value = '';
  document.getElementById('cardio-notes').value = '';
  document.getElementById('cardio-type').value = 'run';
  document.querySelectorAll('#view-log-cardio .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'run');
  });
  watchFormDirty(['cardio-date', 'cardio-duration', 'cardio-distance', 'cardio-notes']);
}

// ── Wiring ──

/** One-time listener wiring for both support forms. Called once at boot. */
export function wireSupport() {
  // Lifting
  document.getElementById('add-exercise-btn').addEventListener('click', () => buildExerciseRow());
  document.getElementById('save-lifting-btn').addEventListener('click', saveLifting);

  document.querySelector('.plan-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('.plan-btn');
    if (btn) selectPlan(btn);
  });

  // Exercise and set rows are created dynamically, so one delegated listener
  // on the list covers every button inside them.
  const list = document.getElementById('exercise-list');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = rowIdOf(btn);
    if (btn.dataset.action === 'exercise-yt') openExerciseYT(id);
    if (btn.dataset.action === 'exercise-remove') document.getElementById(`exercise-row-${id}`)?.remove();
    if (btn.dataset.action === 'set-add') addSetRow(id);
    if (btn.dataset.action === 'set-remove') removeSetRow(btn, id);
  });
  list.addEventListener('change', (e) => {
    const select = e.target.closest('[data-action="exercise-select"]');
    if (select) handleExerciseSelect(rowIdOf(select));
  });

  // Cardio
  document.getElementById('save-cardio-btn').addEventListener('click', saveCardio);
  document.querySelector('#view-log-cardio .toggle-group').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (btn) selectToggle(btn, 'cardio-type');
  });
}
