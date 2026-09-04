// ── main.js ──
// Entry point. index.html loads only this file; everything else is reached
// through ES module imports.
//
// Its job is wiring: register each view's initialiser with the navigator,
// attach the boot listeners, and respond to auth state.

import { signIn, signOut, watchAuth } from './db.js';
import {
  navigate, goBack, showToast, registerView, registerDashboardCard,
  isFormDirty, openDetail, renderDashboard, renderHistory, dismissNudge
} from './ui.js';
import { initMatForm, wireMat } from './mat.js';
import { initLiftingForm, initCardioForm, wireSupport, startMinimumSession } from './support.js';
import { initCoachView, wireCoach } from './coach.js';
import { initFocusView, wireFocus, renderFocusCard } from './focus.js';
import { initProgressView, wireProgress } from './progress.js';
import { initYearView, wireYear } from './year.js';
import { initReadinessView } from './readiness.js';

// ── View registry ──
// navigate() dispatches through this, which is what lets ui.js stay
// unaware of the feature modules.
registerView('dashboard', renderDashboard);
registerView('history', () => renderHistory('all'));
registerView('progress', initProgressView);
registerView('coach', initCoachView);
registerView('log-lifting', initLiftingForm);
registerView('log-mat', initMatForm);
registerView('log-cardio', initCardioForm);
registerView('focus', initFocusView);
registerView('year', initYearView);
registerView('readiness', initReadinessView);
// 'detail' needs no initialiser — openDetail() fills it before navigating.

// The dashboard's focus card, owned by focus.js.
registerDashboardCard(renderFocusCard);

// ── User menu ──
function showUserMenu() {
  document.getElementById('user-menu').classList.toggle('hidden');
  document.getElementById('user-menu-overlay').classList.toggle('hidden');
}

function hideUserMenu() {
  document.getElementById('user-menu').classList.add('hidden');
  document.getElementById('user-menu-overlay').classList.add('hidden');
}

// ── Boot wiring ──
document.getElementById('back-btn').addEventListener('click', goBack);
document.getElementById('user-btn').addEventListener('click', showUserMenu);
document.getElementById('user-menu-overlay').addEventListener('click', hideUserMenu);

document.getElementById('google-signin-btn').addEventListener('click', async () => {
  try {
    await signIn();
  } catch (e) {
    console.error('Sign in error:', e);
    showToast('Sign in failed. Please try again.');
  }
});

document.getElementById('signout-btn').addEventListener('click', async () => {
  hideUserMenu();
  await signOut();
});

// Anything with data-navigate goes to that view: nav bar, dashboard action
// cards, the "See all" link.
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-navigate]');
  if (target) navigate(target.dataset.navigate);
});

// Session cards are rendered into several lists, so one delegated listener
// covers all of them.
document.addEventListener('click', (e) => {
  const card = e.target.closest('.session-card');
  if (card?.dataset.sessionId) openDetail(card.dataset.sessionId);
});

document.getElementById('history-filter-select')
  .addEventListener('change', (e) => renderHistory(e.target.value));

document.getElementById('minimum-session-btn')
  .addEventListener('click', startMinimumSession);

document.getElementById('support-nudge').addEventListener('click', (e) => {
  if (e.target.closest('[data-action="dismiss-nudge"]')) dismissNudge();
});

wireMat();
wireSupport();
wireCoach();
wireFocus();
wireProgress();
wireYear();

// ── Auth state ──
watchAuth((user) => {
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

// ── Service worker ──
// Registered here rather than as an inline script in index.html so the
// update flow can consult the dirty-form guard before reloading.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then(reg => {
      reg.update();
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state !== 'activated') return;
          // Reloading mid-entry would destroy a half-filled log. If a form
          // is dirty, offer the update instead of taking it.
          if (isFormDirty()) showUpdateBanner();
          else window.location.reload();
        });
      });
    });
  });
}

function showUpdateBanner() {
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('button');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.textContent = 'A new version is ready — tap to reload';
  banner.addEventListener('click', () => window.location.reload());
  document.body.appendChild(banner);
}
