// ── Lifting Module ──

const PRESET_EXERCISES = [
  'Goblet Squat',
  'Dumbbell Squat',
  'Romanian Deadlift',
  'Dumbbell Lunge',
  'Bulgarian Split Squat',
  'Step Up',
  'Dumbbell Floor Press',
  'Dumbbell Bench Press',
  'Push Up',
  'Dumbbell Shoulder Press',
  'Lateral Raise',
  'Front Raise',
  'Dumbbell Row',
  'Renegade Row',
  'Pull Up',
  'Inverted Row',
  'Bicep Curl',
  'Hammer Curl',
  'Tricep Kickback',
  'Overhead Tricep Extension',
  'Dumbbell Deadlift',
  'Farmers Carry',
  'Hip Thrust',
  'Glute Bridge',
  'Plank',
  'Dead Bug',
  'Russian Twist',
  'Dumbbell Crunch',
  '-- Custom --',
];

let exerciseRowCount = 0;

function initLiftingForm() {
  const dateInput = document.getElementById('lifting-date');
  dateInput.value = new Date().toISOString().split('T')[0];
  document.getElementById('lifting-notes').value = '';

  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  exerciseRowCount = 0;

  // Start with one exercise row
  addExerciseRow();
}

function addExerciseRow() {
  exerciseRowCount++;
  const id = exerciseRowCount;
  const list = document.getElementById('exercise-list');

  const row = document.createElement('div');
  row.className = 'exercise-row';
  row.id = `exercise-row-${id}`;

  const options = PRESET_EXERCISES.map(name =>
    `<option value="${name}">${name}</option>`
  ).join('');

  row.innerHTML = `
    <div class="exercise-row-top">
      <select class="exercise-select" id="exercise-select-${id}" onchange="handleExerciseSelect(${id})">
        <option value="">Pick exercise...</option>
        ${options}
      </select>
      <button class="remove-btn" onclick="removeExerciseRow(${id})" title="Remove">✕</button>
    </div>
    <div id="custom-name-wrapper-${id}" style="display:none; margin-bottom:10px;">
      <input
        type="text"
        class="exercise-name-input"
        id="custom-name-${id}"
        placeholder="Exercise name..."
        style="width:100%;"
      />
    </div>
    <div class="sets-grid">
      <span>Set</span><span>Reps</span><span>Weight (lbs)</span><span></span>
    </div>
    <div id="sets-${id}"></div>
    <button class="add-set-btn" onclick="addSetRow(${id})">+ Add Set</button>
  `;

  list.appendChild(row);
  addSetRow(id); // start with one set
}

function handleExerciseSelect(id) {
  const select = document.getElementById(`exercise-select-${id}`);
  const customWrapper = document.getElementById(`custom-name-wrapper-${id}`);
  if (select.value === '-- Custom --') {
    customWrapper.style.display = 'block';
    document.getElementById(`custom-name-${id}`).focus();
  } else {
    customWrapper.style.display = 'none';
  }
}

function removeExerciseRow(id) {
  const row = document.getElementById(`exercise-row-${id}`);
  if (row) row.remove();
}

function addSetRow(exerciseId) {
  const setsContainer = document.getElementById(`sets-${exerciseId}`);
  const setNum = setsContainer.children.length + 1;

  const row = document.createElement('div');
  row.className = 'set-row';
  row.innerHTML = `
    <input class="set-input" type="text" value="${setNum}" readonly style="color:var(--text-muted);" />
    <input class="set-input" type="number" placeholder="—" min="1" />
    <input class="set-input" type="number" placeholder="—" min="0" step="2.5" />
    <button class="remove-btn" onclick="removeSetRow(this, ${exerciseId})" title="Remove set">✕</button>
  `;
  setsContainer.appendChild(row);
}

function removeSetRow(btn, exerciseId) {
  btn.closest('.set-row').remove();
  // Renumber sets
  const rows = document.querySelectorAll(`#sets-${exerciseId} .set-row`);
  rows.forEach((row, i) => {
    row.querySelector('.set-input').value = i + 1;
  });
}

function collectExercises() {
  const rows = document.querySelectorAll('.exercise-row');
  const exercises = [];

  rows.forEach(row => {
    const idMatch = row.id.match(/exercise-row-(\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];

    const select = document.getElementById(`exercise-select-${id}`);
    let name = select ? select.value : '';
    if (name === '-- Custom --') {
      const customInput = document.getElementById(`custom-name-${id}`);
      name = customInput ? customInput.value.trim() : '';
    }
    if (!name) return;

    const setRows = document.querySelectorAll(`#sets-${id} .set-row`);
    const sets = [];
    setRows.forEach(setRow => {
      const inputs = setRow.querySelectorAll('input[type="number"]');
      const reps = inputs[0] ? inputs[0].value : '';
      const weight = inputs[1] ? inputs[1].value : '';
      if (reps || weight) {
        sets.push({ reps, weight });
      }
    });

    exercises.push({ name, sets });
  });

  return exercises;
}

function saveLifting() {
  const date = document.getElementById('lifting-date').value;
  if (!date) { showToast('Please select a date'); return; }

  const exercises = collectExercises();
  if (exercises.length === 0) { showToast('Add at least one exercise'); return; }

  const notes = document.getElementById('lifting-notes').value.trim();

  const session = {
    type: 'lifting',
    date,
    exercises,
    notes,
  };

  Storage.saveSession(session);
  showToast('Session saved! 💪');
  navigate('dashboard');
}
