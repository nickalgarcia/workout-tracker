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
  getDoc,
  setDoc,
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
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('user-menu-name').textContent = user.displayName || '';
    document.getElementById('user-menu-email').textContent = user.email || '';

    // Check if profile exists
    const profile = await loadProfile();
    if (!profile) {
      // First time user — show onboarding
      document.getElementById('onboarding-screen').classList.remove('hidden');
      document.getElementById('app').classList.add('hidden');
      initOnboardingActivityListeners();
    } else {
      // Returning user — go straight to app
      document.getElementById('onboarding-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      navigate('dashboard');
    }
  } else {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('onboarding-screen').classList.add('hidden');
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

// ── Profile Helpers ──
function profileRef() {
  return doc(db, 'users', currentUser.uid, 'meta', 'profile');
}

async function loadProfile() {
  try {
    const snap = await getDoc(profileRef());
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

async function saveProfileToDB(profile) {
  await setDoc(profileRef(), profile);
}

// Cached profile for the session
let userProfile = null;

async function getProfile() {
  if (!userProfile) userProfile = await loadProfile();
  return userProfile;
}

// ── Onboarding ──
function initOnboardingActivityListeners() {
  const checkboxes = document.querySelectorAll('#ob-activities input[type="checkbox"]');
  checkboxes.forEach(cb => cb.addEventListener('change', () => {
    updateDaysGrid('ob-activities', 'ob-days-grid');
    toggleDumbbellSection('ob-activities', 'ob-dumbbell-section');
  }));
}

function initSettingsActivityListeners() {
  const checkboxes = document.querySelectorAll('#set-activities input[type="checkbox"]');
  checkboxes.forEach(cb => cb.addEventListener('change', () => {
    updateDaysGrid('set-activities', 'set-days-grid');
    toggleDumbbellSection('set-activities', 'set-dumbbell-section');
  }));
}

function toggleDumbbellSection(activitiesId, sectionId) {
  const liftingChecked = document.querySelector(`#${activitiesId} input[value="lifting"]`)?.checked;
  const section = document.getElementById(sectionId);
  if (section) section.classList.toggle('hidden', !liftingChecked);
}

function updateDaysGrid(activitiesId, gridId) {
  const checked = Array.from(document.querySelectorAll(`#${activitiesId} input:checked`)).map(cb => cb.value);
  const grid = document.getElementById(gridId);

  if (checked.length === 0) {
    grid.innerHTML = '<p class="ob-days-hint">Select your activities above first.</p>';
    return;
  }

  const labels = { lifting: 'Lifting', bjj: 'BJJ', cardio: 'Cardio', yoga: 'Yoga' };
  grid.innerHTML = checked.map(activity => `
    <div class="ob-days-row">
      <span class="ob-days-label">${labels[activity]}</span>
      <select class="ob-days-select field-input" data-activity="${activity}">
        ${[1,2,3,4,5,6,7].map(n => `<option value="${n}">${n}x / week</option>`).join('')}
      </select>
    </div>
  `).join('');
}

function collectOnboardingData(prefix) {
  const name = document.getElementById(`${prefix}-name`)?.value.trim() || '';
  const age = document.getElementById(`${prefix}-age`)?.value || '';
  const weight = document.getElementById(`${prefix}-weight`)?.value || '';
  const height = document.getElementById(`${prefix}-height`)?.value.trim() || '';
  const goal = document.getElementById(`${prefix}-goal`)?.value || '';
  const gender = document.getElementById(`${prefix}-gender`)?.value || '';
  const dumbbellMax = document.getElementById(`${prefix}-dumbbell-max`)?.value || '';

  const activitiesId = prefix === 'ob' ? 'ob-activities' : 'set-activities';
  const daysGridId = prefix === 'ob' ? 'ob-days-grid' : 'set-days-grid';
  const equipmentId = prefix === 'ob' ? 'ob-equipment' : 'set-equipment';

  const activities = Array.from(document.querySelectorAll(`#${activitiesId} input:checked`)).map(cb => cb.value);
  const equipment = Array.from(document.querySelectorAll(`#${equipmentId} input:checked`)).map(cb => cb.value);

  const trainingDays = {};
  document.querySelectorAll(`#${daysGridId} .ob-days-select`).forEach(sel => {
    trainingDays[sel.dataset.activity] = parseInt(sel.value);
  });

  return { name, age: parseInt(age) || null, weight: parseInt(weight) || null, height, goal, gender, dumbbellMax: parseInt(dumbbellMax) || null, activities, equipment, trainingDays };
}

window.selectGoal = (btn, hiddenId) => {
  btn.closest('.ob-goal-grid').querySelectorAll('.ob-goal-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(hiddenId).value = btn.dataset.value;
};

window.skipOnboarding = () => {
  document.getElementById('onboarding-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  navigate('dashboard');
};

window.saveOnboarding = async () => {
  const profile = collectOnboardingData('ob');
  try {
    await saveProfileToDB(profile);
    userProfile = profile;
    showToast('Profile saved!');
    document.getElementById('onboarding-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    navigate('dashboard');
  } catch (e) {
    console.error(e);
    showToast('Error saving profile. Try again.');
  }
};

// ── Settings ──
async function initSettingsView() {
  const profile = await getProfile();
  if (!profile) return;

  if (profile.name) document.getElementById('set-name').value = profile.name;
  if (profile.age) document.getElementById('set-age').value = profile.age;
  if (profile.weight) document.getElementById('set-weight').value = profile.weight;
  if (profile.height) document.getElementById('set-height').value = profile.height;
  if (profile.dumbbellMax) document.getElementById('set-dumbbell-max').value = profile.dumbbellMax;
  if (profile.goal) {
    document.getElementById('set-goal').value = profile.goal;
    document.querySelectorAll('#view-settings .ob-goal-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === profile.goal);
    });
  }

  if (profile.gender) {
    document.getElementById('set-gender').value = profile.gender;
    document.querySelectorAll('#view-settings .ob-goal-grid .ob-goal-btn').forEach(btn => {
      if (btn.getAttribute('onclick')?.includes('set-gender')) {
        btn.classList.toggle('active', btn.dataset.value === profile.gender);
      }
    });
  }

  // Activities
  if (profile.activities) {
    document.querySelectorAll('#set-activities input').forEach(cb => {
      cb.checked = profile.activities.includes(cb.value);
    });
    updateDaysGrid('set-activities', 'set-days-grid');
    toggleDumbbellSection('set-activities', 'set-dumbbell-section');
    // Set saved days
    if (profile.trainingDays) {
      setTimeout(() => {
        document.querySelectorAll('#set-days-grid .ob-days-select').forEach(sel => {
          if (profile.trainingDays[sel.dataset.activity]) {
            sel.value = profile.trainingDays[sel.dataset.activity];
          }
        });
      }, 50);
    }
  }

  // Equipment
  if (profile.equipment) {
    document.querySelectorAll('#set-equipment input').forEach(cb => {
      cb.checked = profile.equipment.includes(cb.value);
    });
  }

  initSettingsActivityListeners();
}

window.saveSettings = async () => {
  const profile = collectOnboardingData('set');
  try {
    await saveProfileToDB(profile);
    userProfile = profile;
    showToast('Settings saved!');
    navigate('dashboard');
  } catch (e) {
    console.error(e);
    showToast('Error saving settings.');
  }
};

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
    plan.exercises.forEach(name => addExerciseRowWithName(name));
  }
}

function addExerciseRowWithName(exerciseName) {
  exerciseRowCount++;
  const id = exerciseRowCount;
  const list = document.getElementById('exercise-list');
  const options = PRESET_EXERCISES.map(n =>
    `<option value="${n}" ${n === exerciseName ? 'selected' : ''}>${n}</option>`
  ).join('');
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
  // Start with 3 sets for plan exercises
  addSetRow(id);
  addSetRow(id);
  addSetRow(id);
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

  // Reset plan selector to Day 1
  document.querySelectorAll('.plan-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.plan === 'day1');
  });
  document.getElementById('selected-plan').value = 'day1';
  loadPlanExercises('day1');
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
  const plan = document.getElementById('selected-plan').value;
  const planLabel = TRAINING_PLANS[plan]?.label || 'Free Session';

  const btn = document.getElementById('save-lifting-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  try {
    await saveSessionToDB({ type: 'lifting', date, exercises, notes, plan, planLabel });
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
const TOP_LEVEL_VIEWS = ['dashboard', 'history', 'progress', 'coach', 'settings'];
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
    'detail': 'SESSION', 'progress': 'PROGRESS',
    'coach': 'COACH', 'settings': 'SETTINGS',
    'log-yoga': 'LOG YOGA', 'log-cardio': 'LOG CARDIO',
    'log-pilates': 'LOG PILATES'
  };
  document.getElementById('page-title').textContent = titles[viewName] || 'TRAIN LOG';

  if (viewName === 'dashboard') await renderDashboard();
  if (viewName === 'log-lifting') initLiftingForm();
  if (viewName === 'log-bjj') initBJJForm();
  if (viewName === 'log-yoga') initYogaForm();
  if (viewName === 'log-cardio') initCardioForm();
  if (viewName === 'log-pilates') initPilatesForm();
  if (viewName === 'history') await renderHistory('all');
  if (viewName === 'progress') await renderProgressView();
  if (viewName === 'coach') initCoachView();
  if (viewName === 'settings') await initSettingsView();
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
  const profile = await getProfile();
  const firstName = profile?.name || currentUser?.displayName?.split(' ')[0] || 'there';
  const greeting = h < 12 ? `Good morning, ${firstName}.` : h < 17 ? `Good afternoon, ${firstName}.` : `Good evening, ${firstName}.`;
  document.getElementById('greeting').textContent = greeting;

  // Build activity cards based on profile — fallback to all if no profile
  const activities = profile?.activities?.length ? profile.activities : ['lifting', 'bjj', 'cardio', 'yoga'];
  const allCards = {
    lifting: `<button class="action-card lifting" onclick="window.navigate('log-lifting')"><span class="card-icon">🏋️</span><span class="card-label">Log Lifting</span><span class="card-sub">Sets · Reps · Weight</span></button>`,
    bjj:     `<button class="action-card bjj" onclick="window.navigate('log-bjj')"><span class="card-icon">🥋</span><span class="card-label">Log BJJ</span><span class="card-sub">Duration · Techniques</span></button>`,
    cardio:  `<button class="action-card cardio" onclick="window.navigate('log-cardio')"><span class="card-icon">🏃</span><span class="card-label">Log Cardio</span><span class="card-sub">Duration · Distance</span></button>`,
    yoga:    `<button class="action-card yoga" onclick="window.navigate('log-yoga')"><span class="card-icon">🧘</span><span class="card-label">Log Yoga</span><span class="card-sub">Duration · Style</span></button>`,
    pilates: `<button class="action-card pilates" onclick="window.navigate('log-pilates')"><span class="card-icon">🤸</span><span class="card-label">Log Pilates</span><span class="card-sub">Style · Focus</span></button>`,
  };
  document.querySelector('.action-cards').innerHTML = activities.map(a => allCards[a] || '').join('');

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
    const allSessions = await getSessionsFromDB('all');
    const sessions = filter === 'all' ? allSessions : allSessions.filter(s => s.type === filter);
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
  let typeLabel = type.toUpperCase();

  if (type === 'lifting') {
    const planLabel = session.planLabel ? `${session.planLabel} · ` : '';
    summary = planLabel + ((session.exercises || []).map(e => e.name).join(', ') || 'Lifting session');
  } else if (type === 'bjj') {
    summary = `${session.duration} min · ${capitalize(session.sessionType)}`;
  } else if (type === 'yoga') {
    summary = `${session.duration} min · ${capitalize(session.style)}`;
  } else if (type === 'cardio') {
    const dist = session.distance ? ` · ${session.distance} ${session.distanceUnit}` : '';
    summary = `${session.duration} min · ${capitalize(session.cardioType)}${dist}`;
  } else if (type === 'pilates') {
    summary = `${session.duration} min · ${capitalize(session.style)} · ${capitalize(session.focus?.replace('_', ' ') || '')}`;
  }

  const typeColors = { lifting: 'lifting', bjj: 'bjj', yoga: 'yoga', cardio: 'cardio-type', pilates: 'pilates-type' };
  const colorClass = typeColors[type] || 'lifting';

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
  } else if (type === 'bjj') {
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
  } else if (type === 'yoga') {
    body = `
      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><span>Duration</span>${session.duration} min</div>
          <div class="detail-meta-item"><span>Style</span>${capitalize(session.style)}</div>
        </div>
      </div>
      ${session.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${session.notes}</div></div>` : ''}
    `;
  } else if (type === 'cardio') {
    body = `
      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><span>Duration</span>${session.duration} min</div>
          <div class="detail-meta-item"><span>Type</span>${capitalize(session.cardioType)}</div>
          ${session.distance ? `<div class="detail-meta-item"><span>Distance</span>${session.distance} ${session.distanceUnit}</div>` : ''}
        </div>
      </div>
      ${session.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${session.notes}</div></div>` : ''}
    `;
  } else if (type === 'pilates') {
    body = `
      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><span>Duration</span>${session.duration} min</div>
          <div class="detail-meta-item"><span>Style</span>${capitalize(session.style)}</div>
          <div class="detail-meta-item"><span>Focus</span>${capitalize(session.focus?.replace('_', ' ') || '')}</div>
        </div>
      </div>
      ${session.notes ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${session.notes}</div></div>` : ''}
    `;
  }

  const typeLabels = { lifting: 'LIFTING', bjj: 'BJJ', yoga: 'YOGA', cardio: 'CARDIO', pilates: 'PILATES' };
  const typeColorClass = type;

  return `
    <div class="detail-header">
      <div class="detail-type ${typeColorClass}">${typeLabels[type] || type.toUpperCase()}</div>
      ${session.planLabel ? `<div class="detail-plan-label">${session.planLabel}</div>` : ''}
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
  const allSessions = await getSessionsFromDB('all');
  const sessions = allSessions.filter(s => s.type === 'lifting');
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
  const allSessions = await getSessionsFromDB('all');
  const sessions = allSessions.filter(s => s.type === 'lifting');

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

// ── Yoga Module ──
function initYogaForm() {
  document.getElementById('yoga-date').value = todayStr();
  document.getElementById('yoga-duration').value = '';
  document.getElementById('yoga-notes').value = '';
  document.getElementById('yoga-style').value = 'vinyasa';
  document.querySelectorAll('#view-log-yoga .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'vinyasa');
  });
}

window.saveYoga = async () => {
  const date = document.getElementById('yoga-date').value;
  if (!date) { showToast('Please select a date'); return; }
  const duration = document.getElementById('yoga-duration').value;
  if (!duration) { showToast('Please enter duration'); return; }
  const style = document.getElementById('yoga-style').value;
  const notes = document.getElementById('yoga-notes').value.trim();

  const btn = document.getElementById('save-yoga-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;
  try {
    await saveSessionToDB({ type: 'yoga', date, duration: parseInt(duration), style, notes });
    showToast('Yoga session logged! 🧘');
    navigate('dashboard');
  } catch (e) {
    console.error(e);
    showToast('Error saving. Try again.');
  } finally {
    btn.textContent = 'Save Session';
    btn.disabled = false;
  }
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
    await saveSessionToDB({
      type: 'cardio',
      date,
      duration: parseInt(duration),
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

// ── Pilates Module ──
function initPilatesForm() {
  document.getElementById('pilates-date').value = todayStr();
  document.getElementById('pilates-duration').value = '';
  document.getElementById('pilates-notes').value = '';
  document.getElementById('pilates-style').value = 'mat';
  document.getElementById('pilates-focus').value = 'core';
  document.querySelectorAll('#view-log-pilates .toggle-btn').forEach(btn => {
    const group = btn.closest('.toggle-group');
    const hiddenId = group.nextElementSibling?.id;
    btn.classList.toggle('active',
      (hiddenId === 'pilates-style' && btn.dataset.value === 'mat') ||
      (hiddenId === 'pilates-focus' && btn.dataset.value === 'core')
    );
  });
}

window.savePilates = async () => {
  const date = document.getElementById('pilates-date').value;
  if (!date) { showToast('Please select a date'); return; }
  const duration = document.getElementById('pilates-duration').value;
  if (!duration) { showToast('Please enter duration'); return; }
  const style = document.getElementById('pilates-style').value;
  const focus = document.getElementById('pilates-focus').value;
  const notes = document.getElementById('pilates-notes').value.trim();

  const btn = document.getElementById('save-pilates-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;
  try {
    await saveSessionToDB({ type: 'pilates', date, duration: parseInt(duration), style, focus, notes });
    showToast('Pilates session logged! 🤸');
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
let coachProfile = {};
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
    coachSessions = (await getSessionsFromDB('all')).slice(0, 20);
    coachProfile = await getProfile() || {};

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
    const liftCount = coachSessions.filter(s => s.type === 'lifting').length;
    const bjjCount = coachSessions.filter(s => s.type === 'bjj').length;

    output.innerHTML = `
      <div class="coach-meta">
        Based on your last ${sessionCount} sessions —
        ${liftCount} lifting, ${bjjCount} BJJ
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
