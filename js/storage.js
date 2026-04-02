// ── Storage Layer ──
// All data lives in localStorage under two keys:
//   'trainlog_sessions' → array of session objects

const Storage = (() => {

  const KEY = 'trainlog_sessions';

  function getSessions() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveSession(session) {
    const sessions = getSessions();
    // Give it a unique ID if it doesn't have one
    session.id = session.id || Date.now().toString();
    sessions.unshift(session); // newest first
    localStorage.setItem(KEY, JSON.stringify(sessions));
    return session;
  }

  function deleteSession(id) {
    const sessions = getSessions().filter(s => s.id !== id);
    localStorage.setItem(KEY, JSON.stringify(sessions));
  }

  function getRecentSessions(limit = 5) {
    return getSessions().slice(0, limit);
  }

  function getSessionsByType(type) {
    if (type === 'all') return getSessions();
    return getSessions().filter(s => s.type === type);
  }

  function getSessionById(id) {
    return getSessions().find(s => s.id === id) || null;
  }

  // Returns all unique exercise names used across lifting sessions
  function getUsedExercises() {
    const sessions = getSessions().filter(s => s.type === 'lifting');
    const names = new Set();
    sessions.forEach(s => {
      (s.exercises || []).forEach(e => {
        if (e.name) names.add(e.name);
      });
    });
    return Array.from(names).sort();
  }

  // Returns all lifting sessions that include a specific exercise
  function getProgressForExercise(name) {
    return getSessions()
      .filter(s => s.type === 'lifting')
      .map(s => {
        const ex = (s.exercises || []).find(e => e.name === name);
        if (!ex) return null;
        // Find best set (max weight)
        const bestSet = (ex.sets || []).reduce((best, set) => {
          return parseFloat(set.weight) > parseFloat(best.weight || 0) ? set : best;
        }, {});
        return { date: s.date, sets: ex.sets, bestSet };
      })
      .filter(Boolean)
      .reverse(); // chronological order
  }

  return {
    getSessions,
    saveSession,
    deleteSession,
    getRecentSessions,
    getSessionsByType,
    getSessionById,
    getUsedExercises,
    getProgressForExercise,
  };

})();
