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
  where,
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
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    // Show app, hide auth screen
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    // Set user menu info
    document.getElementById('user-menu-name').textContent = user.displayName || '';
    document.getElementById('user-menu-email').textContent = user.email || '';
    // Boot app
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

// Get all sessions, newest first
async function getSessionsFromDB(type = 'all') {
  let q;
  if (type === 'all') {
    q = query(sessionsRef(), orderBy('createdAt', 'desc'));
  } else {
    q = query(sessionsRef(), where('type', '==', type), orderBy('createdAt', 'desc'));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Delete a session
async function deleteSessionFromDB(id) {
  await deleteDoc(doc(db, 'users', currentUser.uid, 'sessions', id));
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
  addExerciseRow();
}

window.addExerciseRow = () => {
  exerciseRowCount++;
  const id = exerciseRowCount;
  const list = document.getElementById('exercise-list');
  const options = PRESET_EXERCISES.map(n => `<option value="${n}">${n}</option>`).join('');
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
  addSetRow(id);
};

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
    await saveSessionToDB({ type: 'lifting', date, exercises, notes });
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
    await saveSessionToDB({ type: 'bjj', date, duration: parseInt(duration), sessionType, techniques, notes });
    showToast('BJJ session logged! 🥋');
    navigate('dashboard');
  } catch (e) {
    console.error(e);
    showToast('Error saving. Try again.');
  } finally {
    btn.textContent = 'Save Session';
    btn.disabled = false;
  }
};

// ── App / Navigation ──
const TOP_LEVEL_VIEWS = ['dashboard', 'history', 'progress'];
let viewHistory = ['dashboard'];

window.navigate = async (viewName) => {
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
    'log-bjj': 'LOG BJJ', 'history': 'HISTORY',
    'detail': 'SESSION', 'progress': 'PROGRESS'
  };
  document.getElementById('page-title').textContent = titles[viewName] || 'TRAIN LOG';

  if (viewName === 'dashboard') await renderDashboard();
  if (viewName === 'log-lifting') initLiftingForm();
  if (viewName === 'log-bjj') initBJJForm();
  if (viewName === 'history') await renderHistory('all');
  if (viewName === 'progress') await renderProgressView();
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
  const greeting = h < 12 ? 'Good morning, Nick.' : h < 17 ? 'Good afternoon, Nick.' : 'Good evening, Nick.';
  document.getElementById('greeting').textContent = greeting;

  const container = document.getElementById('recent-sessions');
  container.innerHTML = '<div class="loading-state">Loading...</div>';

  try {
    const sessions = await getSessionsFromDB('all');
    const recent = sessions.slice(0, 5);
    if (recent.length === 0) {
      container.innerHTML = `<div class="empty-state">No sessions yet. Log your first workout!</div>`;
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
    const sessions = await getSessionsFromDB(filter);
    if (sessions.length === 0) {
      container.innerHTML = `<div class="empty-state">No ${filter === 'all' ? '' : filter + ' '}sessions yet.</div>`;
    } else {
      container.innerHTML = sessions.map(buildSessionCard).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Error loading sessions.</div>`;
  }
}

window.filterHistory = async (btn) => {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await renderHistory(btn.dataset.filter);
};

// ── Session Card ──
function buildSessionCard(session) {
  const type = session.type;
  const dateStr = formatDate(session.date);
  let summary = '';
  if (type === 'lifting') {
    summary = (session.exercises || []).map(e => e.name).join(', ') || 'Lifting session';
  } else {
    summary = `${session.duration} min · ${capitalize(session.sessionType)}`;
  }
  return `
    <div class="session-card" onclick="window.openDetail('${session.id}')">
      <div class="session-card-left">
        <span class="session-card-type ${type}">${type === 'bjj' ? 'BJJ' : 'Lifting'}</span>
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
  const sessions = await getSessionsFromDB('all');
  const session = sessions.find(s => s.id === id);
  if (!session) return;

  document.getElementById('detail-content').innerHTML = buildDetailHTML(session);
  document.getElementById('delete-session-btn').onclick = () => window.deleteSession(id);
  navigate('detail');
};

function buildDetailHTML(session) {
  const type = session.type;
  const dateStr = formatDateLong(session.date);
  let body = '';

  if (type === 'lifting') {
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
  } else {
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
    body = `
      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><span>Duration</span>${session.duration} min</div>
          <div class="detail-meta-item"><span>Type</span>${capitalize(session.sessionType)}</div>
        </div>
      </div>
      ${techniques ? `<div class="detail-section"><div class="detail-section-title">Techniques</div><div class="detail-technique-list">${techniques}</div></div>` : ''}
      ${session.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${session.notes}</div></div>` : ''}
    `;
  }

  return `
    <div class="detail-header">
      <div class="detail-type ${type}">${type === 'bjj' ? 'BJJ' : 'Lifting'}</div>
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
  const sessions = await getSessionsFromDB('lifting');
  const names = new Set();
  sessions.forEach(s => (s.exercises || []).forEach(e => { if (e.name) names.add(e.name); }));

  const select = document.getElementById('progress-exercise');
  select.innerHTML = '<option value="">Select an exercise...</option>' +
    Array.from(names).sort().map(n => `<option value="${n}">${n}</option>`).join('');

  document.getElementById('progress-content').innerHTML =
    `<div class="progress-empty">Select an exercise to see your progress.</div>`;
}

window.renderProgress = async () => {
  const name = document.getElementById('progress-exercise').value;
  const container = document.getElementById('progress-content');
  if (!name) {
    container.innerHTML = `<div class="progress-empty">Select an exercise to see your progress.</div>`;
    return;
  }

  container.innerHTML = '<div class="loading-state">Loading...</div>';
  const sessions = await getSessionsFromDB('lifting');

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
  return new Date().toISOString().split('T')[0];
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
