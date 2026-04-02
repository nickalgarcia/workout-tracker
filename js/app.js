// ── App ──

// Views that live in the bottom nav (top-level)
const TOP_LEVEL_VIEWS = ['dashboard', 'history', 'progress'];

// Current view stack for back button
let viewHistory = ['dashboard'];

// ── Navigation ──
function navigate(viewName) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  // Show target view
  const target = document.getElementById(`view-${viewName}`);
  if (!target) return;
  target.classList.add('active');

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  // Back button: show if not top-level
  const backBtn = document.getElementById('back-btn');
  const isTopLevel = TOP_LEVEL_VIEWS.includes(viewName);
  backBtn.classList.toggle('hidden', isTopLevel);

  // Track history
  if (viewHistory[viewHistory.length - 1] !== viewName) {
    if (isTopLevel) {
      viewHistory = [viewName];
    } else {
      viewHistory.push(viewName);
    }
  }

  // Update page title
  const titles = {
    'dashboard': 'TRAIN LOG',
    'log-lifting': 'LOG LIFTING',
    'log-bjj': 'LOG BJJ',
    'history': 'HISTORY',
    'detail': 'SESSION',
    'progress': 'PROGRESS',
  };
  document.getElementById('page-title').textContent = titles[viewName] || 'TRAIN LOG';

  // Initialize views
  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'log-lifting') initLiftingForm();
  if (viewName === 'log-bjj') initBJJForm();
  if (viewName === 'history') renderHistory('all');
  if (viewName === 'progress') renderProgressView();
}

function goBack() {
  viewHistory.pop();
  const prev = viewHistory[viewHistory.length - 1] || 'dashboard';
  viewHistory.pop(); // navigate() will re-add it
  navigate(prev);
}

// ── Greeting ──
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning, Nick.';
  if (h < 17) return 'Good afternoon, Nick.';
  return 'Good evening, Nick.';
}

// ── Dashboard ──
function renderDashboard() {
  document.getElementById('greeting').textContent = getGreeting();

  const sessions = Storage.getRecentSessions(5);
  const container = document.getElementById('recent-sessions');

  if (sessions.length === 0) {
    container.innerHTML = `<div class="empty-state">No sessions yet. Log your first workout!</div>`;
    return;
  }

  container.innerHTML = sessions.map(s => buildSessionCard(s)).join('');
}

// ── Session Card ──
function buildSessionCard(session) {
  const type = session.type;
  const dateStr = formatDate(session.date);

  let summary = '';
  if (type === 'lifting') {
    const exNames = (session.exercises || []).map(e => e.name).join(', ');
    summary = exNames || 'Lifting session';
  } else if (type === 'bjj') {
    summary = `${session.duration} min · ${capitalize(session.sessionType)}`;
  }

  return `
    <div class="session-card" onclick="openDetail('${session.id}')">
      <div class="session-card-left">
        <span class="session-card-type ${type}">${type === 'bjj' ? 'BJJ' : 'Lifting'}</span>
        <span class="session-card-date">${dateStr}</span>
        <span class="session-card-summary">${summary}</span>
      </div>
      <span class="session-card-right">›</span>
    </div>
  `;
}

// ── History ──
function renderHistory(filter) {
  const sessions = Storage.getSessionsByType(filter);
  const container = document.getElementById('history-list');

  if (sessions.length === 0) {
    container.innerHTML = `<div class="empty-state">No ${filter === 'all' ? '' : filter + ' '}sessions yet.</div>`;
    return;
  }

  container.innerHTML = sessions.map(s => buildSessionCard(s)).join('');
}

function filterHistory(btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderHistory(btn.dataset.filter);
}

// ── Detail ──
function openDetail(id) {
  const session = Storage.getSessionById(id);
  if (!session) return;

  const container = document.getElementById('detail-content');
  container.innerHTML = buildDetailHTML(session);

  // Wire delete button
  const deleteBtn = document.getElementById('delete-session-btn');
  deleteBtn.onclick = () => deleteSession(id);

  navigate('detail');
}

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
        </div>
      `).join('');

      return `
        <div class="detail-exercise">
          <div class="detail-exercise-name">${ex.name}</div>
          <div class="detail-sets">${sets}</div>
        </div>
      `;
    }).join('');

    body = `
      <div class="detail-section">
        <div class="detail-section-title">Exercises</div>
        ${exercises}
      </div>
      ${session.notes ? `
        <div class="detail-section">
          <div class="detail-section-title">Notes</div>
          <div class="detail-notes">${session.notes}</div>
        </div>
      ` : ''}
    `;

  } else if (type === 'bjj') {
    const techniques = (session.techniques || []).map(t =>
      `<div class="detail-technique">${t}</div>`
    ).join('');

    body = `
      <div class="detail-section">
        <div class="detail-section-title">Details</div>
        <div class="detail-meta">
          <div class="detail-meta-item"><span>Duration</span>${session.duration} min</div>
          <div class="detail-meta-item"><span>Type</span>${capitalize(session.sessionType)}</div>
        </div>
      </div>
      ${techniques ? `
        <div class="detail-section">
          <div class="detail-section-title">Techniques</div>
          <div class="detail-technique-list">${techniques}</div>
        </div>
      ` : ''}
      ${session.notes ? `
        <div class="detail-section">
          <div class="detail-section-title">Notes</div>
          <div class="detail-notes">${session.notes}</div>
        </div>
      ` : ''}
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

function deleteSession(id) {
  if (!confirm('Delete this session? This cannot be undone.')) return;
  Storage.deleteSession(id);
  showToast('Session deleted');
  goBack();
}

// ── Progress ──
function renderProgressView() {
  const select = document.getElementById('progress-exercise');
  const used = Storage.getUsedExercises();

  select.innerHTML = '<option value="">Select an exercise...</option>' +
    used.map(name => `<option value="${name}">${name}</option>`).join('');

  document.getElementById('progress-content').innerHTML =
    `<div class="progress-empty">Select an exercise to see your progress.</div>`;
}

function renderProgress() {
  const name = document.getElementById('progress-exercise').value;
  const container = document.getElementById('progress-content');

  if (!name) {
    container.innerHTML = `<div class="progress-empty">Select an exercise to see your progress.</div>`;
    return;
  }

  const data = Storage.getProgressForExercise(name);

  if (data.length === 0) {
    container.innerHTML = `<div class="progress-empty">No data found for ${name}.</div>`;
    return;
  }

  // Find max weight ever
  let maxWeight = 0;
  data.forEach(d => {
    const w = parseFloat(d.bestSet.weight || 0);
    if (w > maxWeight) maxWeight = w;
  });

  const rows = data.map(d => {
    const w = parseFloat(d.bestSet.weight || 0);
    const isPR = w === maxWeight && maxWeight > 0;
    const totalSets = (d.sets || []).length;
    const totalReps = (d.sets || []).reduce((sum, s) => sum + (parseInt(s.reps) || 0), 0);

    return `
      <tr>
        <td>${formatDate(d.date)}</td>
        <td>${totalSets} × ${Math.round(totalReps / totalSets) || '—'}</td>
        <td>${w ? w + ' lbs' : '—'} ${isPR ? '<span class="pr-badge">PR</span>' : ''}</td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="progress-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Sets × Reps</th>
          <th>Best Weight</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('back-btn').addEventListener('click', goBack);
  navigate('dashboard');
});
