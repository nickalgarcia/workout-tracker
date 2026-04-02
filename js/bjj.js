// ── BJJ Module ──

function initBJJForm() {
  const dateInput = document.getElementById('bjj-date');
  dateInput.value = new Date().toISOString().split('T')[0];
  document.getElementById('bjj-duration').value = '';
  document.getElementById('bjj-notes').value = '';
  document.getElementById('bjj-type').value = 'both';

  // Reset toggles
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === 'both');
  });

  // Reset techniques
  const list = document.getElementById('technique-list');
  list.innerHTML = '';
  addTechniqueRow();
}

function selectToggle(btn, hiddenId) {
  // Deactivate siblings
  btn.closest('.toggle-group').querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(hiddenId).value = btn.dataset.value;
}

function addTechniqueRow() {
  const list = document.getElementById('technique-list');
  const row = document.createElement('div');
  row.className = 'technique-row';
  row.innerHTML = `
    <input
      type="text"
      class="technique-input"
      placeholder="e.g. Rear naked choke, Guard pass, Hip escape..."
    />
    <button class="remove-btn" onclick="removeTechniqueRow(this)" title="Remove">✕</button>
  `;
  list.appendChild(row);

  // Focus the new input
  const input = row.querySelector('.technique-input');
  if (list.children.length > 1) input.focus();
}

function removeTechniqueRow(btn) {
  const row = btn.closest('.technique-row');
  const list = document.getElementById('technique-list');
  if (list.children.length > 1) {
    row.remove();
  } else {
    row.querySelector('.technique-input').value = '';
  }
}

function collectTechniques() {
  return Array.from(document.querySelectorAll('.technique-input'))
    .map(input => input.value.trim())
    .filter(Boolean);
}

function saveBJJ() {
  const date = document.getElementById('bjj-date').value;
  if (!date) { showToast('Please select a date'); return; }

  const duration = document.getElementById('bjj-duration').value;
  if (!duration) { showToast('Please enter duration'); return; }

  const sessionType = document.getElementById('bjj-type').value;
  const techniques = collectTechniques();
  const notes = document.getElementById('bjj-notes').value.trim();

  const session = {
    type: 'bjj',
    date,
    duration: parseInt(duration),
    sessionType,
    techniques,
    notes,
  };

  Storage.saveSession(session);
  showToast('BJJ session logged! 🥋');
  navigate('dashboard');
}
