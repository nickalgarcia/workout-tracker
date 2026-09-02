// ── coach.js ──
// The coach view: analysis request, follow-up chat, response formatting.

import { PROFILE, getSessions } from './db.js';
import { sessionKind, escapeHtml } from './ui.js';

const ENDPOINT = 'https://us-central1-workout-tracker-c1205.cloudfunctions.net/getCoachingAdvice';

let coachSessions = [];
let chatHistory = [];

/**
 * Turn the model's markdown-ish reply into the app's insight blocks.
 *
 * This deliberately produces HTML and is NOT escaped — the whole point is
 * to render **bold** as markup. It is applied to model output only, never
 * to anything typed into the app.
 */
function formatCoachResponse(text) {
  return text
    // Remove markdown headers like # or ##
    .replace(/^#{1,3}\s+.+\n?/gm, '')
    // Keep the text of bold markers, as markup
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Drop italic markers, keep the text
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

async function askCoach(messages) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions: coachSessions, profile: PROFILE, messages })
  });
  if (!response.ok) throw new Error('Function call failed');
  const data = await response.json();
  return data.advice;
}

async function getCoachingAdvice() {
  const btn = document.getElementById('get-advice-btn');
  const output = document.getElementById('coach-output');

  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  output.innerHTML = '<div class="coach-loading"><div class="coach-spinner"></div><p>Claude is reviewing your sessions...</p></div>';

  try {
    coachSessions = (await getSessions()).slice(0, 20);

    if (coachSessions.length === 0) {
      output.innerHTML = '<div class="coach-empty">Log some sessions first and your coach will have data to work with.</div>';
      return;
    }

    const advice = await askCoach([]) || 'No advice returned.';
    chatHistory = [{ role: 'assistant', content: advice }];

    const matCount = coachSessions.filter(s => sessionKind(s) === 'mat').length;
    const supportCount = coachSessions.length - matCount;

    output.innerHTML = `
      <div class="coach-meta">
        Based on your last ${coachSessions.length} sessions —
        ${matCount} mat, ${supportCount} support
      </div>
      <div class="coach-advice">${formatCoachResponse(advice)}</div>
      <button class="coach-refresh-btn" data-action="coach-refresh">↺ Refresh Analysis</button>
    `;

    document.getElementById('coach-chat').classList.remove('hidden');
    document.getElementById('chat-messages').innerHTML = '';
  } catch (e) {
    console.error(e);
    output.innerHTML = '<div class="coach-empty">Something went wrong. Check your connection and try again.</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze My Training';
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  input.disabled = true;
  document.getElementById('chat-send-btn').disabled = true;

  const messagesEl = document.getElementById('chat-messages');
  // The user's own text — escaped. The reply below is model output.
  messagesEl.innerHTML += `<div class="chat-msg chat-msg-user">${escapeHtml(message)}</div>`;
  messagesEl.innerHTML += `<div class="chat-msg chat-msg-assistant"><div class="coach-spinner" style="width:16px;height:16px;margin:4px 0;"></div></div>`;
  messagesEl.scrollTop = messagesEl.scrollHeight;

  chatHistory.push({ role: 'user', content: message });

  try {
    const reply = await askCoach(chatHistory) || 'No response.';
    chatHistory.push({ role: 'assistant', content: reply });
    const msgs = messagesEl.querySelectorAll('.chat-msg-assistant');
    msgs[msgs.length - 1].innerHTML = reply;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (e) {
    console.error(e);
    const msgs = messagesEl.querySelectorAll('.chat-msg-assistant');
    msgs[msgs.length - 1].textContent = 'Something went wrong. Try again.';
  } finally {
    input.disabled = false;
    document.getElementById('chat-send-btn').disabled = false;
    input.focus();
  }
}

export function initCoachView() {
  document.getElementById('coach-output').innerHTML = '';
  const btn = document.getElementById('get-advice-btn');
  btn.disabled = false;
  btn.textContent = 'Analyze My Training';
  chatHistory = [];
  document.getElementById('coach-chat').classList.add('hidden');
}

/** One-time listener wiring. Called once at boot. */
export function wireCoach() {
  document.getElementById('get-advice-btn').addEventListener('click', getCoachingAdvice);
  document.getElementById('chat-send-btn').addEventListener('click', sendChatMessage);

  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });

  // The refresh button is rendered as part of the analysis output, so it is
  // reached by delegation rather than a direct listener.
  document.getElementById('coach-output').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="coach-refresh"]')) getCoachingAdvice();
  });
}
