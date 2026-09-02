// ── ui.js ──
// The app shell: navigation, toasts, the dirty-form guard, shared
// formatting helpers, and the rendering shared across views (session cards,
// session detail, dashboard, history, progress).
//
// Feature modules (mat, support, coach) import from here. This module does
// not import them — it reaches view initialisers through registerView(),
// which is what keeps the dependency graph acyclic.

import { PROFILE, getSessions, getSession, deleteSession } from './db.js';

// ── Escaping ──
// Everything the user typed passes through this before it reaches
// innerHTML. Values the app generates itself do not need it.
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Helpers ──
export function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ── Toast ──
export function showToast(message) {
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

// ── Dirty form guard ──
let formIsDirty = false;

export function markFormDirty() { formIsDirty = true; }
export function clearFormDirty() { formIsDirty = false; }
export function isFormDirty() { return formIsDirty; }

export function watchFormDirty(formIds) {
  clearFormDirty();
  formIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', markFormDirty, { once: false });
  });
}

// ── Toggle buttons ──
// Shared by every toggle-group in the app: highlight the pressed button and
// write its value into the group's hidden input.
export function selectToggle(btn, hiddenId) {
  btn.closest('.toggle-group').querySelectorAll('.toggle-btn')
    .forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(hiddenId).value = btn.dataset.value;
}

// ── Navigation ──
const TOP_LEVEL_VIEWS = ['dashboard', 'history', 'focus', 'progress', 'coach'];
const LOG_VIEWS = ['log-lifting', 'log-mat', 'log-cardio'];

const TITLES = {
  'dashboard': 'MAT LOG', 'log-lifting': 'LOG LIFTING',
  'log-mat': 'LOG MAT SESSION', 'log-cardio': 'LOG CARDIO',
  'history': 'HISTORY', 'detail': 'SESSION',
  'focus': 'FOCUS', 'progress': 'PROGRESS',
  'coach': 'COACH'
};

// Feature modules register their view initialiser here, so navigate() can
// dispatch without importing them. main.js does the registering.
const viewInitialisers = {};

export function registerView(name, initFn) {
  viewInitialisers[name] = initFn;
}

// The dashboard's focus card is owned by focus.js, which imports from here.
// Registering it rather than importing it is what keeps that from being a
// cycle — same reason as registerView above.
let dashboardCardRenderer = null;

export function registerDashboardCard(fn) {
  dashboardCardRenderer = fn;
}

let viewHistory = ['dashboard'];

export async function navigate(viewName) {
  // Warn if leaving a form with unsaved data
  const currentView = viewHistory[viewHistory.length - 1];
  if (formIsDirty && LOG_VIEWS.includes(currentView) && viewName !== currentView) {
    if (!confirm('You have unsaved changes. Leave without saving?')) return;
  }
  clearFormDirty();

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`view-${viewName}`)?.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.navigate === viewName);
  });

  const isTopLevel = TOP_LEVEL_VIEWS.includes(viewName);
  document.getElementById('back-btn').classList.toggle('hidden', isTopLevel);

  if (isTopLevel) viewHistory = [viewName];
  else if (viewHistory[viewHistory.length - 1] !== viewName) viewHistory.push(viewName);

  document.getElementById('page-title').textContent = TITLES[viewName] || 'MAT LOG';

  const init = viewInitialisers[viewName];
  if (init) await init();
}

export function goBack() {
  // Pop twice: once for the view being left, once because navigate() below
  // pushes the destination back on.
  viewHistory.pop();
  const prev = viewHistory[viewHistory.length - 1] || 'dashboard';
  viewHistory.pop();
  navigate(prev);
}

// ── Session kind ──
// Reads expect schemaVersion 2: type 'mat' | 'support' (+ subtype).
// A document that reaches here in any other shape was not migrated; it is
// surfaced rather than silently rendered blank. Run scripts/migrate-v2.js.
export function sessionKind(session) {
  if (session.type === 'mat') return 'mat';
  if (session.type === 'support') return session.subtype === 'cardio' ? 'cardio' : 'lifting';
  console.warn(
    `Session ${session.id} has type "${session.type}" and schemaVersion ` +
    `${session.schemaVersion}. Expected schemaVersion 2 — run scripts/migrate-v2.js.`
  );
  return 'unknown';
}

export function sessionMinutes(session) {
  return session.minutes ?? null;
}

const KIND_LABELS = { mat: 'MAT', lifting: 'LIFTING', cardio: 'CARDIO', unknown: 'NOT MIGRATED' };
const KIND_COLORS = { mat: 'bjj', lifting: 'lifting', cardio: 'cardio-type' };

// ── Session card ──
export function buildSessionCard(session) {
  const kind = sessionKind(session);
  const mins = sessionMinutes(session);
  const dateStr = formatDate(session.date);
  let summary = '';

  if (kind === 'lifting') {
    const exercises = (session.exercises || []).map(e => escapeHtml(e.name));
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
    summary = `Unrecognised type "${escapeHtml(session.type)}" — needs migrating`;
  }

  const typeLabel = KIND_LABELS[kind] || String(kind).toUpperCase();
  const colorClass = KIND_COLORS[kind] || 'lifting';

  return `
    <div class="session-card" data-session-id="${session.id}">
      <div class="session-card-left">
        <span class="session-card-type ${colorClass}">${typeLabel}</span>
        <span class="session-card-date">${dateStr}</span>
        <span class="session-card-summary">${summary}</span>
      </div>
      <span class="session-card-right">›</span>
    </div>
  `;
}

// ── Session detail ──
function notesSection(notes) {
  return notes
    ? `<div class="detail-section"><div class="detail-section-title">Notes</div><div class="detail-notes">${escapeHtml(notes)}</div></div>`
    : '';
}

export function buildDetailHTML(session) {
  const kind = sessionKind(session);
  const mins = sessionMinutes(session);
  const dateStr = formatDateLong(session.date);
  let body = '';

  if (kind === 'lifting') {
    const exercises = (session.exercises || []).map(ex => {
      const sets = (ex.sets || []).map((set, i) => `
        <div class="detail-set">
          <span class="detail-set-label">Set ${i + 1}</span>
          ${set.reps ? `<div>${escapeHtml(set.reps)} reps</div>` : ''}
          ${set.weight ? `<div>${escapeHtml(set.weight)} lbs</div>` : ''}
        </div>`).join('');
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' proper form tutorial')}`;
      return `
        <div class="detail-exercise">
          <div class="detail-exercise-header">
            <div class="detail-exercise-name">${escapeHtml(ex.name)}</div>
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
      ${notesSection(session.notes)}
    `;
  } else if (kind === 'mat') {
    const techniques = (session.techniques || []).map(t => {
      const name = typeof t === 'string' ? t : t.name;
      const link = typeof t === 'object' ? t.link : null;
      const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent('BJJ ' + name + ' tutorial')}`;
      return `
        <div class="detail-technique">
          <div class="detail-technique-header">
            <span>${escapeHtml(name)}</span>
            <div class="detail-technique-links">
              ${link ? `<a href="${encodeURI(link)}" target="_blank" class="detail-saved-link">📌 Saved</a>` : ''}
              <a href="${ytUrl}" target="_blank" class="detail-yt-link">▶ YouTube</a>
            </div>
          </div>
        </div>`;
    }).join('');
    // positions comes from a closed vocabulary, but escape it anyway —
    // it is cheap and it keeps "escape everything that came from a document"
    // as a rule with no exceptions to remember.
    const positions = (session.positions || []).length
      ? `<div class="detail-section"><div class="detail-section-title">Positions</div><div class="detail-notes">${session.positions.map(escapeHtml).join(' · ')}</div></div>`
      : '';
    const reflections = [
      session.worked ? `<div class="detail-meta-item"><span>What worked</span>${escapeHtml(session.worked)}</div>` : '',
      session.beat ? `<div class="detail-meta-item"><span>What beat me</span>${escapeHtml(session.beat)}</div>` : ''
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
      ${notesSection(session.notes)}
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
      ${notesSection(session.notes)}
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

export async function openDetail(id) {
  const session = await getSession(id);
  if (!session) return;

  document.getElementById('detail-content').innerHTML = buildDetailHTML(session);
  document.getElementById('delete-session-btn').onclick = () => removeSession(id);
  navigate('detail');
}

async function removeSession(id) {
  if (!confirm('Delete this session? This cannot be undone.')) return;
  try {
    await deleteSession(id);
    showToast('Session deleted');
    goBack();
  } catch (e) {
    console.error(e);
    showToast('Error deleting session.');
  }
}

// ── Dashboard ──

/** Monday 00:00 of the week containing `today`. */
function startOfWeek(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayFromMonday = (d.getDay() + 6) % 7;   // Sunday is 0, we want 6
  d.setDate(d.getDate() - dayFromMonday);
  return d;
}

function onOrAfter(dateStr, boundary) {
  if (!dateStr) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d) >= boundary;
}

function daysSince(dateStr, today = new Date()) {
  if (!dateStr) return Infinity;
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor((today - new Date(y, m - 1, d)) / 86400000);
}

function weekBalance(sessions) {
  const monday = startOfWeek();
  const thisWeek = sessions.filter(s => onOrAfter(s.date, monday));
  const mat = thisWeek.filter(s => sessionKind(s) === 'mat').length;
  const support = thisWeek.length - mat;
  const { mat: matTarget, support: supportTarget } = PROFILE.weeklyTargets;
  return `Mat ${mat} of ${matTarget} <span class="week-dot">·</span> Support ${support} of ${supportTarget}`;
}

// The nudge is dismissible for the day only, so it comes back tomorrow if
// the situation has not changed.
const NUDGE_KEY = 'matlog:nudgeDismissed';

function nudgeDismissedToday() {
  try { return localStorage.getItem(NUDGE_KEY) === todayStr(); } catch { return false; }
}

export function dismissNudge() {
  try { localStorage.setItem(NUDGE_KEY, todayStr()); } catch { /* private mode */ }
  document.getElementById('support-nudge').innerHTML = '';
}

function supportNudge(sessions) {
  if (nudgeDismissedToday()) return '';
  const recentSupport = sessions.filter(s =>
    sessionKind(s) !== 'mat' && daysSince(s.date) <= 14);
  if (recentSupport.length > 0) return '';

  return `
    <div class="nudge">
      <div class="nudge-text">No lifting in 14 days. Grip and posterior chain are what let you hold structure against bigger training partners.</div>
      <button class="nudge-dismiss" data-action="dismiss-nudge" aria-label="Dismiss for today">✕</button>
    </div>`;
}

export async function renderDashboard() {
  const h = new Date().getHours();
  const firstName = PROFILE.name;
  const greeting = h < 12 ? `Good morning, ${firstName}.` : h < 17 ? `Good afternoon, ${firstName}.` : `Good evening, ${firstName}.`;
  document.getElementById('greeting').textContent = greeting;

  const container = document.getElementById('recent-sessions');
  container.innerHTML = '<div class="loading-state">Loading...</div>';

  try {
    const allSessions = await getSessions();

    if (dashboardCardRenderer) {
      await dashboardCardRenderer(document.getElementById('focus-card'), allSessions);
    }

    document.getElementById('week-balance').innerHTML = weekBalance(allSessions);
    document.getElementById('support-nudge').innerHTML = supportNudge(allSessions);

    const recent = allSessions.slice(0, 5);
    container.innerHTML = recent.length === 0
      ? `<div class="welcome-state">
           <div class="welcome-icon">👋</div>
           <div class="welcome-title">Welcome, ${escapeHtml(firstName)}.</div>
           <div class="welcome-text">Log your first mat session and the focus card, problem log and position coverage all start filling in.</div>
         </div>`
      : recent.map(buildSessionCard).join('');
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="empty-state">Error loading sessions.</div>`;
  }
}

// ── History ──
export async function renderHistory(filter = 'all') {
  const container = document.getElementById('history-list');
  container.innerHTML = '<div class="loading-state">Loading...</div>';
  try {
    const allSessions = await getSessions();

    // Dropdown counts, keyed on kind so every session lands in one bucket.
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
    console.error(e);
    container.innerHTML = `<div class="empty-state">Error loading sessions.</div>`;
  }
}
