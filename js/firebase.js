// ── firebase.js ── Entry point for all Firebase logic

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ── Config ──
const firebaseConfig = {
  apiKey: "AIzaSyCyyUoNqY1LVA_hfMCCEgZ0_vFI4ggTwyY",
  authDomain: "workout-tracker-c1205.firebaseapp.com",
  projectId: "workout-tracker-c1205",
  storageBucket: "workout-tracker-c1205.firebasestorage.app",
  messagingSenderId: "306664520085",
  appId: "1:306664520085:web:5c74c95f3c83d74d409e9c",
  measurementId: "G-CY7B796LCW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── Profile ──
// Single-user app. This replaces the old users/{uid}/meta/profile document
// and the onboarding flow that populated it. Edit by hand when it changes.
const PROFILE = {
  name: 'Nick',
  startedTraining: '2025-01',
  belt: 'white',          // update by hand when this changes
  style: 'no-gi',
  bodyType: 'smaller and lighter than most training partners',
  goals: 'recreational — fun, fitness, community. Wants to build an offensive guard game.',
  weeklyTargets: { mat: 3, support: 2 }
};

// ── Schema ──
// See docs/SCHEMA.md. Two session types: 'mat' and 'support'.
const SCHEMA_VERSION = 2;

// Fixed vocabulary for mat positions. Order matters — it is the display
// order, running from bottom/defensive through to top/offensive. This is a
// closed list on purpose: `positions` is a multi-select from exactly these
// strings and never free text, because that is what makes it aggregate.
// Technique nuance goes in `techniques`, which stays free text.
export const POSITIONS = [
  'Pre-guard / seated',
  'Closed guard (bottom)',
  'Half guard (bottom)',
  'Open guard (bottom)',
  'Guard passing (top)',
  'Side control (top)',
  'Side control (bottom)',
  'Mount (top)',
  'Mount (bottom)',
  'Back attacks',
  'Back defense',
  'Standing / takedowns'
];

// ── Current user ──
let currentUser = null;

// ── Auth ──
window.signIn = async () => {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Sign in error:', e);
    showToast('Sign in failed. Please try again.');
  }
};

window.signOut = async () => {
  hideUserMenu();
  await firebaseSignOut(auth);
};

window.showUserMenu = () => {
  document.getElementById('user-menu').classList.toggle('hidden');
  document.getElementById('user-menu-overlay').classList.toggle('hidden');
};

window.hideUserMenu = () => {
  document.getElementById('user-menu').classList.add('hidden');
  document.getElementById('user-menu-overlay').classList.add('hidden');
};

// Watch auth state
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('user-menu-name').textContent = user.displayName || '';
    document.getElementById('user-menu-email').textContent = user.email || '';

    document.getElementById('app').classList.remove('hidden');
    navigate('dashboard');
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  }
});

// ── Firestore helpers ──
function sessionsRef() {
  return collection(db, 'users', currentUser.uid, 'sessions');
}

// Save a session
async function saveSessionToDB(session) {
  session.createdAt = serverTimestamp();
  const docRef = await addDoc(sessionsRef(), session);
  return docRef.id;
}

// Get all sessions, newest first.
//
// Archived documents (the old yoga and pilates sessions) are excluded here,
// which is the single place sessions enter the app — so every view gets the
// filter for free. It is done client-side on purpose: a Firestore
// `where('archived', '!=', true)` would also drop every document that has
// no `archived` field at all, which is all of them.
async function getSessionsFromDB() {
  const snapshot = await getDocs(query(sessionsRef(), orderBy('createdAt', 'desc')));
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => !s.archived);
}

// Delete a session
async function deleteSessionFromDB(id) {
  await deleteDoc(doc(db, 'users', currentUser.uid, 'sessions', id));
}

// ── Daredevil Training Plans ──
const TRAINING_PLANS = {
  day1: {
    label: 'Day 1 — Push/Legs',
    exercises: [
      'Goblet Squat',
      'Dumbbell Floor Press',
      'Dumbbell Shoulder Press',
      'Push Up',
      'Dumbbell Lunge',
      'Overhead Tricep Extension',
      'Dead Bug',
    ]
  },
  day2: {
    label: 'Day 2 — Pull/Hinge',
    exercises: [
      'Romanian Deadlift',
      'Dumbbell Row',
      'Pull Up',
      'Bicep Curl',
      'Lateral Raise',
      'Dumbbell Rear Delt Fly',
      'Russian Twist',
    ]
  },
  blank: {
    label: 'Free Session',
    exercises: []
  }
};

window.selectPlan = (btn) => {
  document.querySelectorAll('.plan-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const plan = btn.dataset.plan;
  document.getElementById('selected-plan').value = plan;
  loadPlanExercises(plan);
};

function loadPlanExercises(planKey) {
  const plan = TRAINING_PLANS[planKey];
  const list = document.getElementById('exercise-list');
  list.innerHTML = '';
  exerciseRowCount = 0;

  if (plan.exercises.length === 0) {
    addExerciseRow();
  } else {
    plan.exercises.forEach(name => buildExerciseRow(name, 3));
  }
}

// ── Lifting Module ──
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

let exerciseRowCount = 0;

function initLiftingForm() {
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

// Builds one exercise row. `name` preselects an exercise (plan rows);
// `setCount` is how many blank set rows to start with — 3 for plan
// exercises, 1 for a row added by hand.
function buildExerciseRow(name = '', setCount = 1) {
  exerciseRowCount++;
  const id = exerciseRowCount;
  const list = document.getElementById('exercise-list');
  const options = PRESET_EXERCISES
    .map(n => `<option value="${n}"${n === name ? ' selected' : ''}>${n}</option>`)
    .join('');
  const row = document.createElement('div');
  row.className = 'exercise-row';
  row.id = `exercise-row-${id}`;
  row.innerHTML = `
    <div class="exercise-row-top">
      <select class="exercise-select" id="exercise-select-${id}" onchange="window.handleExerciseSelect(${id})">
        <option value="">Pick exercise...</option>
        ${options}
      </select>
      <button class="yt-btn" onclick="window.openExerciseYT(${id})" title="Search YouTube">▶</button>
      <button class="remove-btn" onclick="window.removeExerciseRow(${id})">✕</button>
    </div>
    <div id="custom-name-wrapper-${id}" style="display:none; margin-bottom:10px;">
      <input type="text" class="exercise-name-input" id="custom-name-${id}" placeholder="Exercise name..." style="width:100%;" />
    </div>
    <div class="sets-grid">
      <span>Set</span><span>Reps</span><span>Weight (lbs)</span><span></span>
    </div>
    <div id="sets-${id}"></div>
    <button class="add-set-btn" onclick="window.addSetRow(${id})">+ Add Set</button>
  `;
  list.appendChild(row);
  for (let i = 0; i < setCount; i++) addSetRow(id);
}

window.addExerciseRow = () => buildExerciseRow();

window.openExerciseYT = (id) => {
  const select = document.getElementById(`exercise-select-${id}`);
  let name = select?.value || '';
  if (name === '-- Custom --') name = document.getElementById(`custom-name-${id}`)?.value.trim() || '';
  if (!name) { showToast('Pick an exercise first'); return; }
  window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(name + ' proper form tutorial')}`, '_blank');
};

window.handleExerciseSelect = (id) => {
  const select = document.getElementById(`exercise-select-${id}`);
  const wrapper = document.getElementById(`custom-name-wrapper-${id}`);
  if (select.value === '-- Custom --') {
    wrapper.style.display = 'block';
    document.getElementById(`custom-name-${id}`).focus();
  } else {
    wrapper.style.display = 'none';
  }
};

window.removeExerciseRow = (id) => {
  document.getElementById(`exercise-row-${id}`)?.remove();
};

window.addSetRow = (exerciseId) => {
  const container = document.getElementById(`sets-${exerciseId}`);
  const setNum = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'set-row';
  row.innerHTML = `
    <input class="set-input" type="text" value="${setNum}" readonly style="color:var(--text-muted);" />
    <input class="set-input" type="number" placeholder="—" min="1" />
    <input class="set-input" type="number" placeholder="—" min="0" step="2.5" />
    <button class="remove-btn" onclick="window.removeSetRow(this, ${exerciseId})">✕</button>
  `;
  container.appendChild(row);
};

window.removeSetRow = (btn, exerciseId) => {
  btn.closest('.set-row').remove();
  document.querySelectorAll(`#sets-${exerciseId} .set-row`).forEach((row, i) => {
    row.querySelector('.set-input').value = i + 1;
  });
};

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
      name = document.getElementById(`custom-name-${id}`)?.value.trim() || '';
    }
    if (!name) return;
    const setRows = document.querySelectorAll(`#sets-${id} .set-row`);
    const sets = [];
    setRows.forEach(setRow => {
      const inputs = setRow.querySelectorAll('input[type="number"]');
      const reps = inputs[0]?.value || '';
      const weight = inputs[1]?.value || '';
      if (reps || weight) sets.push({ reps, weight });
    });
    exercises.push({ name, sets });
  });
  return exercises;
}

window.saveLifting = async () => {
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
    await saveSessionToDB({
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
};

// ── BJJ Module ──
function initBJJForm() {
  document.getElementById('bjj-date').value = todayStr();
  document.getElementById('bjj-duration').value = '';
  document.getElementById('bjj-notes').value = '';
  document.getElementById('bjj-type').value = 'both';
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'both');
  });
  document.getElementById('technique-list').innerHTML = '';
  addTechniqueRow();
  watchFormDirty(['bjj-date', 'bjj-duration', 'bjj-notes']);
}

window.selectToggle = (btn, hiddenId) => {
  btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(hiddenId).value = btn.dataset.value;
};

window.addTechniqueRow = () => {
  const list = document.getElementById('technique-list');
  const row = document.createElement('div');
  row.className = 'technique-row-wrapper';
  row.innerHTML = `
    <div class="technique-row">
      <input type="text" class="technique-input" placeholder="e.g. Rear naked choke, Guard pass, Hip escape..." />
      <button class="yt-btn" onclick="window.openTechniqueYT(this)" title="Search YouTube">▶</button>
      <button class="remove-btn" onclick="window.removeTechniqueRow(this)">✕</button>
    </div>
    <div class="technique-link-row">
      <input type="url" class="technique-link-input" placeholder="Paste a video link to save (optional)" />
    </div>
  `;
  list.appendChild(row);
  if (list.children.length > 1) row.querySelector('.technique-input').focus();
};

window.openTechniqueYT = (btn) => {
  const input = btn.closest('.technique-row').querySelector('.technique-input');
  const name = input?.value.trim() || '';
  if (!name) { showToast('Enter a technique first'); return; }
  window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent('BJJ ' + name + ' tutorial')}`, '_blank');
};

window.removeTechniqueRow = (btn) => {
  const list = document.getElementById('technique-list');
  const wrapper = btn.closest('.technique-row-wrapper');
  if (list.children.length > 1) wrapper.remove();
  else wrapper.querySelector('.technique-input').value = '';
};

window.saveBJJ = async () => {
  const date = document.getElementById('bjj-date').value;
  if (!date) { showToast('Please select a date'); return; }
  const duration = document.getElementById('bjj-duration').value;
  if (!duration) { showToast('Please enter duration'); return; }

  const sessionType = document.getElementById('bjj-type').value;
  const techniques = Array.from(document.querySelectorAll('.technique-row-wrapper'))
    .map(wrapper => {
      const name = wrapper.querySelector('.technique-input')?.value.trim() || '';
      const link = wrapper.querySelector('.technique-link-input')?.value.trim() || '';
      if (!name) return null;
      return link ? { name, link } : { name };
    })
    .filter(Boolean);
  const notes = document.getElementById('bjj-notes').value.trim();

  const btn = document.getElementById('save-bjj-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    clearFormDirty();
    await saveSessionToDB({
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
};

// ── Dirty Form Guard ──
let formIsDirty = false;

function markFormDirty() { formIsDirty = true; }
function clearFormDirty() { formIsDirty = false; }

function watchFormDirty(formIds) {
  clearFormDirty();
  formIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', markFormDirty, { once: false });
  });
}

// ── App / Navigation ──
const TOP_LEVEL_VIEWS = ['dashboard', 'history', 'focus', 'progress', 'coach'];
let viewHistory = ['dashboard'];

window.navigate = async (viewName) => {
  // Warn if leaving a form with unsaved data
  const logViews = ['log-lifting', 'log-bjj', 'log-cardio'];
  const currentView = viewHistory[viewHistory.length - 1];
  if (formIsDirty && logViews.includes(currentView) && viewName !== currentView) {
    if (!confirm('You have unsaved changes. Leave without saving?')) return;
  }
  clearFormDirty();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewName}`)?.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  const isTopLevel = TOP_LEVEL_VIEWS.includes(viewName);
  document.getElementById('back-btn').classList.toggle('hidden', isTopLevel);

  if (isTopLevel) viewHistory = [viewName];
  else if (viewHistory[viewHistory.length - 1] !== viewName) viewHistory.push(viewName);

  const titles = {
    'dashboard': 'TRAIN LOG', 'log-lifting': 'LOG LIFTING',
    'log-bjj': 'LOG BJJ', 'log-cardio': 'LOG CARDIO',
    'history': 'HISTORY', 'detail': 'SESSION',
    'focus': 'FOCUS', 'progress': 'PROGRESS',
    'coach': 'COACH'
  };
  document.getElementById('page-title').textContent = titles[viewName] || 'TRAIN LOG';

  if (viewName === 'dashboard') await renderDashboard();
  if (viewName === 'log-lifting') initLiftingForm();
  if (viewName === 'log-bjj') initBJJForm();
  if (viewName === 'log-cardio') initCardioForm();
  if (viewName === 'history') await renderHistory('all');
  if (viewName === 'progress') await renderProgressView();
  if (viewName === 'coach') initCoachView();
  // 'focus' is a stub for now — the focus feature fills it in.
};

function goBack() {
  viewHistory.pop();
  const prev = viewHistory[viewHistory.length - 1] || 'dashboard';
  viewHistory.pop();
  navigate(prev);
}

// ── Render Dashboard ──
async function renderDashboard() {
  const h = new Date().getHours();
  const firstName = PROFILE.name;
  const greeting = h < 12 ? `Good morning, ${firstName}.` : h < 17 ? `Good afternoon, ${firstName}.` : `Good evening, ${firstName}.`;
  document.getElementById('greeting').textContent = greeting;

  const allSessions = await getSessionsFromDB();

  // Build streak — count unique training days in last 7 days
  const today = new Date();
  const last7 = new Set();
  allSessions.forEach(s => {
    if (!s.date) return;
    const [y, m, d] = s.date.split('-');
    const sessionDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    const diffDays = Math.floor((today - sessionDate) / (1000 * 60 * 60 * 24));
    if (diffDays >= 0 && diffDays < 7) last7.add(s.date);
  });
  const streakDays = last7.size;
  const streakEl = document.getElementById('streak-count');
  if (streakEl) {
    streakEl.textContent = streakDays > 0
      ? `${streakDays} session${streakDays > 1 ? 's' : ''} this week 🔥`
      : 'No sessions yet this week';
  }

  const container = document.getElementById('recent-sessions');
  container.innerHTML = '<div class="loading-state">Loading...</div>';

  try {
    const recent = allSessions.slice(0, 5);
    if (recent.length === 0) {
      container.innerHTML = `
        <div class="welcome-state">
          <div class="welcome-icon">👋</div>
          <div class="welcome-title">Welcome to Train Log, ${firstName}!</div>
          <div class="welcome-text">You're all set up. Tap any activity above to log your first session. Your AI Coach will have personalized advice after a few sessions.</div>
        </div>`;
    } else {
      container.innerHTML = recent.map(buildSessionCard).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error loading sessions.</div>`;
  }
}

// ── Render History ──
async function renderHistory(filter) {
  const container = document.getElementById('history-list');
  container.innerHTML = '<div class="loading-state">Loading...</div>';
  try {
    const allSessions = await getSessionsFromDB();

    // Build dropdown with counts — only show kinds that have sessions.
    // Keyed on kind so v1 'bjj' and v2 'mat' docs land in the same bucket.
    const kindCounts = {};
    allSessions.forEach(s => {
      const k = sessionKind(s);
      kindCounts[k] = (kindCounts[k] || 0) + 1;
    });

    const kindLabels = { mat: 'Mat', lifting: 'Lifting', cardio: 'Cardio' };
    const order = ['mat', 'lifting', 'cardio'];
    const options = [
      `<option value="all">All Sessions (${allSessions.length})</option>`,
      ...order.filter(k => kindCounts[k]).map(k =>
        `<option value="${k}" ${filter === k ? 'selected' : ''}>${kindLabels[k]} (${kindCounts[k]})</option>`
      )
    ].join('');

    document.getElementById('history-filter-select').innerHTML = options;
    if (filter === 'all') document.getElementById('history-filter-select').value = 'all';

    const sessions = filter === 'all' ? allSessions : allSessions.filter(s => sessionKind(s) === filter);
    if (sessions.length === 0) {
      container.innerHTML = `<div class="empty-state">No ${filter === 'all' ? '' : filter + ' '}sessions yet.</div>`;
    } else {
      container.innerHTML = sessions.map(buildSessionCard).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error loading sessions.</div>`;
  }
}

window.filterHistory = async (select) => {
  await renderHistory(select.value);
};

// ── Session kind ──
// Reads expect schemaVersion 2: type 'mat' | 'support' (+ subtype).
// A document that reaches here in any other shape was not migrated; it is
// surfaced rather than silently rendered blank. Run scripts/migrate-v2.js.
function sessionKind(session) {
  if (session.type === 'mat') return 'mat';
  if (session.type === 'support') return session.subtype === 'cardio' ? 'cardio' : 'lifting';
  console.warn(
    `Session ${session.id} has type "${session.type}" and schemaVersion ` +
    `${session.schemaVersion}. Expected schemaVersion 2 — run scripts/migrate-v2.js.`
  );
  return 'unknown';
}

function sessionMinutes(session) {
  return session.minutes ?? null;
}

const KIND_LABELS = { mat: 'MAT', lifting: 'LIFTING', cardio: 'CARDIO', unknown: 'NOT MIGRATED' };
const KIND_COLORS = { mat: 'bjj', lifting: 'lifting', cardio: 'cardio-type' };

// ── Session Card ──
function buildSessionCard(session) {
  const kind = sessionKind(session);
  const mins = sessionMinutes(session);
  const dateStr = formatDate(session.date);
  let summary = '';

  if (kind === 'lifting') {
    const exercises = (session.exercises || []).map(e => e.name);
    const shown = exercises.slice(0, 3);
    const extra = exercises.length > 3 ? ` +${exercises.length - 3} more` : '';
    summary = shown.join(', ') + extra || 'Lifting session';
  } else if (kind === 'mat') {
    const parts = [`${mins} min`, capitalize(session.sessionType)];
    if (session.rounds) parts.push(`${session.rounds} rounds`);
    summary = parts.filter(Boolean).join(' · ');
  } else if (kind === 'cardio') {
    const dist = session.distance ? ` · ${session.distance} ${session.distanceUnit}` : '';
    summary = `${mins} min · ${capitalize(session.cardioType)}${dist}`;
  } else {
    summary = `Unrecognised type "${session.type}" — needs migrating`;
  }

  const typeLabel = KIND_LABELS[kind] || String(kind).toUpperCase();
  const colorClass = KIND_COLORS[kind] || 'lifting';

  return `
    <div class="session-card" onclick="window.openDetail('${session.id}')">
      <div class="session-card-left">
        <span class="session-card-type ${colorClass}">${typeLabel}</span>
        <span class="session-card-date">${dateStr}</span>
        <span class="session-card-summary">${summary}</span>
      </div>
      <span class="session-card-right">›</span>
    </div>
  `;
}

// ── Detail ──
window.openDetail = async (id) => {
  // Find session from a fresh fetch
  const sessions = await getSessionsFromDB();
  const session = sessions.find(s => s.id === id);
  if (!session) return;

  document.getElementById('detail-content').innerHTML = buildDetailHTML(session);
  document.getElementById('delete-session-btn').onclick = () => window.deleteSession(id);
  navigate('detail');
};

function buildDetailHTML(session) {
  const kind = sessionKind(session);
  const mins = sessionMinutes(session);
  const dateStr = formatDateLong(session.date);
  let body = '';

  if (kind === 'lifting') {
    const exercises = (session.exercises || []).map(ex => {
      const sets = (ex.sets || []).map((set, i) => `
        <div class="detail-set">
          <span class="detail-set-label">Set ${i + 1}</span>
          ${set.reps ? `<div>${set.reps} reps</div>` : ''}
          ${set.weight ? `<div>${set.weight} lbs</div>` : ''}
        </div>`).join('');
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' proper form tutorial')}`;
      return `
        <div class="detail-exercise">
          <div class="detail-exercise-header">
            <div class="detail-exercise-name">${ex.name}</div>
            <a href="${ytUrl}" target="_blank" class="detail-yt-link" title="Watch on YouTube">▶ YouTube</a>
          </div>
          <div class="detail-sets">${sets}</div>
        </div>`;
    }).join('');
    body = `
      <div class="detail-section">
        <div class="detail-section-title">Exercises</div>
        ${exercises}
      </div>
      ${session.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${session.notes}</div></div>` : ''}
    `;
  } else if (kind === 'mat') {
    const techniques = (session.techniques || []).map(t => {
      const name = typeof t === 'string' ? t : t.name;
      const link = typeof t === 'object' ? t.link : null;
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent('BJJ ' + name + ' tutorial')}`;
      return `
        <div class="detail-technique">
          <div class="detail-technique-header">
            <span>${name}</span>
            <div class="detail-technique-links">
              ${link ? `<a href="${link}" target="_blank" class="detail-saved-link">📌 Saved</a>` : ''}
              <a href="${ytUrl}" target="_blank" class="detail-yt-link">▶ YouTube</a>
            </div>
          </div>
        </div>`;
    }).join('');
    const positions = (session.positions || []).length
      ? `<div class="detail-section"><div class="detail-section-title">Positions</div><div class="detail-notes">${session.positions.join(' · ')}</div></div>`
      : '';
    const reflections = [
      session.worked ? `<div class="detail-meta-item"><span>What worked</span>${session.worked}</div>` : '',
      session.beat ? `<div class="detail-meta-item"><span>What beat me</span>${session.beat}</div>` : ''
    ].filter(Boolean).join('');
    body = `
      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><span>Duration</span>${mins} min</div>
          <div class="detail-meta-item"><span>Type</span>${capitalize(session.sessionType)}</div>
          ${session.rounds ? `<div class="detail-meta-item"><span>Rounds</span>${session.rounds}</div>` : ''}
          ${session.readiness ? `<div class="detail-meta-item"><span>Readiness</span>${session.readiness}/5</div>` : ''}
          ${session.focusAttempted ? `<div class="detail-meta-item"><span>Focus</span>${capitalize(session.focusAttempted)}</div>` : ''}
        </div>
      </div>
      ${positions}
      ${reflections ? `<div class="detail-section"><div class="detail-section-title">Reflection</div><div class="detail-meta">${reflections}</div></div>` : ''}
      ${techniques ? `<div class="detail-section"><div class="detail-section-title">Techniques</div><div class="detail-technique-list">${techniques}</div></div>` : ''}
      ${session.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${session.notes}</div></div>` : ''}
    `;
  } else if (kind === 'cardio') {
    body = `
      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><span>Duration</span>${mins} min</div>
          <div class="detail-meta-item"><span>Type</span>${capitalize(session.cardioType)}</div>
          ${session.distance ? `<div class="detail-meta-item"><span>Distance</span>${session.distance} ${session.distanceUnit}</div>` : ''}
        </div>
      </div>
      ${session.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${session.notes}</div></div>` : ''}
    `;
  }

  const detailColor = { mat: 'bjj', lifting: 'lifting', cardio: 'cardio' };

  return `
    <div class="detail-header">
      <div class="detail-type ${detailColor[kind] || kind}">${KIND_LABELS[kind] || String(kind).toUpperCase()}</div>
      <div class="detail-date">${dateStr}</div>
    </div>
    ${body}
  `;
}

window.deleteSession = async (id) => {
  if (!confirm('Delete this session? This cannot be undone.')) return;
  try {
    await deleteSessionFromDB(id);
    showToast('Session deleted');
    goBack();
  } catch (e) {
    showToast('Error deleting session.');
  }
};

// ── Progress ──
async function renderProgressView() {
  const allSessions = await getSessionsFromDB();
  const sessions = allSessions.filter(s => sessionKind(s) === 'lifting');
  const names = new Set();
  sessions.forEach(s => (s.exercises || []).forEach(e => { if (e.name) names.add(e.name); }));

  const select = document.getElementById('progress-exercise');
  select.innerHTML = '<option value="">Select an exercise...</option>' +
    Array.from(names).sort().map(n => `<option value="${n}">${n}</option>`).join('');

  const sessionCount = sessions.length;
  let message = '';

  if (sessionCount === 0) {
    message = `
      <div class="progress-guidance">
        <div class="progress-guidance-icon">📋</div>
        <div class="progress-guidance-title">No lifting sessions yet</div>
        <div class="progress-guidance-text">Log your first workout to start tracking progress. Your data will appear here after your first session.</div>
      </div>`;
  } else if (sessionCount < 3) {
    const remaining = 3 - sessionCount;
    message = `
      <div class="progress-guidance">
        <div class="progress-guidance-icon">📈</div>
        <div class="progress-guidance-title">Keep going — you're ${sessionCount === 1 ? 'just getting started' : 'almost there'}!</div>
        <div class="progress-guidance-text">Progress tracking becomes meaningful after <strong>3 sessions</strong> of the same exercise. Log ${remaining} more session${remaining > 1 ? 's' : ''} to start seeing trends.</div>
        <div class="progress-guidance-tip">💡 You can still select an exercise above to see your starting point.</div>
      </div>`;
  } else {
    message = `<div class="progress-empty">Select an exercise above to see your progress.</div>`;
  }

  document.getElementById('progress-content').innerHTML = message;
}

window.renderProgress = async () => {
  const name = document.getElementById('progress-exercise').value;
  const container = document.getElementById('progress-content');
  if (!name) {
    container.innerHTML = `<div class="progress-empty">Select an exercise to see your progress.</div>`;
    return;
  }

  container.innerHTML = '<div class="loading-state">Loading...</div>';
  const allSessions = await getSessionsFromDB();
  const sessions = allSessions.filter(s => sessionKind(s) === 'lifting');

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
    container.innerHTML = `<div class="progress-empty">No data found for ${name}.</div>`;
    return;
  }

  let maxWeight = Math.max(...data.map(d => parseFloat(d.bestSet.weight || 0)));

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
    </table>
  `;
};

// ── Cardio Module ──
function initCardioForm() {
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

window.saveCardio = async () => {
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
    await saveSessionToDB({
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
};

// ── Coach ──
let coachSessions = [];
let coachProfile = PROFILE;
let chatHistory = [];

function initCoachView() {
  const output = document.getElementById('coach-output');
  output.innerHTML = '';
  document.getElementById('get-advice-btn').disabled = false;
  document.getElementById('get-advice-btn').textContent = 'Analyze My Training';
  chatHistory = [];
  // Hide chat until analysis runs
  document.getElementById('coach-chat').classList.add('hidden');
}

window.getCoachingAdvice = async () => {
  const btn = document.getElementById('get-advice-btn');
  const output = document.getElementById('coach-output');

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  output.innerHTML = '<div class="coach-loading"><div class="coach-spinner"></div><p>Claude is reviewing your sessions...</p></div>';

  try {
    coachSessions = (await getSessionsFromDB()).slice(0, 20);

    if (coachSessions.length === 0) {
      output.innerHTML = '<div class="coach-empty">Log some sessions first and your coach will have data to work with.</div>';
      btn.disabled = false;
      btn.textContent = 'Analyze My Training';
      return;
    }

    const response = await fetch(
      'https://us-central1-workout-tracker-c1205.cloudfunctions.net/getCoachingAdvice',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: coachSessions, profile: coachProfile, messages: [] })
      }
    );

    if (!response.ok) throw new Error('Function call failed');

    const data = await response.json();
    const advice = data.advice || 'No advice returned.';

    // Store as first message in chat history
    chatHistory = [{ role: 'assistant', content: advice }];

    const formatted = formatCoachResponse(advice);
    const sessionCount = coachSessions.length;
    const matCount = coachSessions.filter(s => sessionKind(s) === 'mat').length;
    const supportCount = coachSessions.length - matCount;

    output.innerHTML = `
      <div class="coach-meta">
        Based on your last ${sessionCount} sessions —
        ${matCount} mat, ${supportCount} support
      </div>
      <div class="coach-advice">${formatted}</div>
      <button class="coach-refresh-btn" onclick="window.getCoachingAdvice()">↺ Refresh Analysis</button>
    `;

    // Show chat after analysis
    const chat = document.getElementById('coach-chat');
    chat.classList.remove('hidden');
    document.getElementById('chat-messages').innerHTML = '';

  } catch (e) {
    console.error(e);
    output.innerHTML = '<div class="coach-empty">Something went wrong. Check your connection and try again.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze My Training';
  }
};

window.sendChatMessage = async () => {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.disabled = true;
  document.getElementById('chat-send-btn').disabled = true;

  const messagesEl = document.getElementById('chat-messages');

  // Add user message to UI
  messagesEl.innerHTML += `<div class="chat-msg chat-msg-user">${message}</div>`;
  messagesEl.innerHTML += `<div class="chat-msg chat-msg-assistant"><div class="coach-spinner" style="width:16px;height:16px;margin:4px 0;"></div></div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // Add to history
  chatHistory.push({ role: 'user', content: message });

  try {
    const response = await fetch(
      'https://us-central1-workout-tracker-c1205.cloudfunctions.net/getCoachingAdvice',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessions: coachSessions,
          profile: coachProfile,
          messages: chatHistory
        })
      }
    );

    if (!response.ok) throw new Error('Function call failed');

    const data = await response.json();
    const reply = data.advice || 'No response.';

    chatHistory.push({ role: 'assistant', content: reply });

    // Replace spinner with response
    const msgs = messagesEl.querySelectorAll('.chat-msg-assistant');
    msgs[msgs.length - 1].innerHTML = reply;
    messagesEl.scrollTop = messagesEl.scrollHeight;

  } catch (e) {
    console.error(e);
    const msgs = messagesEl.querySelectorAll('.chat-msg-assistant');
    msgs[msgs.length - 1].innerHTML = 'Something went wrong. Try again.';
  } finally {
    input.disabled = false;
    document.getElementById('chat-send-btn').disabled = false;
    input.focus();
  }
};

window.handleChatKey = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    window.sendChatMessage();
  }
};

function formatCoachResponse(text) {
  return text
    // Remove markdown headers like # or ##
    .replace(/^#{1,3}\s+.+\n?/gm, '')
    // Remove bold markers ** but keep the text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Remove italic markers * but keep the text
    .replace(/\*(.*?)\*/g, '$1')
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const isNumbered = /^\d+\./.test(line.trim());
      return isNumbered
        ? `<div class="coach-insight">${line.trim()}</div>`
        : `<div class="coach-insight-body">${line.trim()}</div>`;
    })
    .join('');
}

// ── Toast ──
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

// ── Helpers ──
function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ── Boot ──
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('google-signin-btn').addEventListener('click', window.signIn);
