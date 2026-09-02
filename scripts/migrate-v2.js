#!/usr/bin/env node
/**
 * migrate-v2.js — convert users/{uid}/sessions to schemaVersion 2.
 *
 * See docs/SCHEMA.md for the target shapes.
 *
 *   node migrate-v2.js              # dry run — prints everything, writes nothing
 *   node migrate-v2.js --commit     # actually writes
 *
 * Safe to re-run: documents already at schemaVersion 2 are skipped.
 */

// firebase-admin v14 removed the namespaced `admin.firestore()` API entirely.
// These modular subpath imports work on both v13 and v14.
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROJECT_ID = 'workout-tracker-c1205';
const BATCH_LIMIT = 400;              // Firestore caps a batch at 500 ops

const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const uidFlag = (argv.find(a => a.startsWith('--uid=')) || '').split('=')[1];
const unknown = argv.filter(a => a !== '--commit' && a !== '--dry-run' && !a.startsWith('--uid='));
if (unknown.length) {
  console.error(`Unrecognised argument(s): ${unknown.join(', ')}`);
  console.error('Usage: node migrate-v2.js [--uid=<uid>] [--commit]');
  process.exit(2);
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error(
    'GOOGLE_APPLICATION_CREDENTIALS is not set.\n' +
    'See scripts/README.md for how to create a service-account key.'
  );
  process.exit(1);
}

initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const db = getFirestore();

// ── Mapping ────────────────────────────────────────────────────────────
// Each mapper returns the fields to write. FieldValue.delete() removes a
// field. Anything not mentioned is left exactly as it is.

/** Normalise the mixed string[] / {name,link}[] shapes into {name, link?}. */
function normaliseTechniques(techniques) {
  if (!Array.isArray(techniques)) return [];
  return techniques
    .map(t => {
      if (typeof t === 'string') {
        const name = t.trim();
        return name ? { name } : null;
      }
      if (t && typeof t === 'object' && typeof t.name === 'string') {
        const name = t.name.trim();
        if (!name) return null;
        const link = typeof t.link === 'string' ? t.link.trim() : '';
        return link ? { name, link } : { name };
      }
      return null;
    })
    .filter(Boolean);
}

function mapDoc(data) {
  if (data.schemaVersion === 2) return { action: 'skip', reason: 'already v2' };

  const stamp = { schemaVersion: 2, migratedAt: FieldValue.serverTimestamp() };

  switch (data.type) {
    case 'bjj':
      return {
        action: 'migrate',
        kind: 'mat',
        update: {
          ...stamp,
          type: 'mat',
          minutes: typeof data.duration === 'number' ? data.duration : null,
          duration: FieldValue.delete(),
          sessionType: data.sessionType ?? null,
          techniques: normaliseTechniques(data.techniques),
          notes: data.notes ?? '',
          // Never recorded on v1 documents. Left empty rather than invented.
          rounds: null,
          positions: [],
          focusId: null,
          focusAttempted: null,
          worked: '',
          beat: '',
          readiness: null,
        },
      };

    case 'lifting':
      return {
        action: 'migrate',
        kind: 'lifting',
        update: {
          ...stamp,
          type: 'support',
          subtype: 'lifting',
          // v1 lifting sessions never recorded a duration.
          minutes: null,
          exercises: Array.isArray(data.exercises) ? data.exercises : [],
          cardioType: null,
          distance: null,
          distanceUnit: null,
          notes: data.notes ?? '',
          plan: FieldValue.delete(),
          planLabel: FieldValue.delete(),
        },
      };

    case 'cardio':
      return {
        action: 'migrate',
        kind: 'cardio',
        update: {
          ...stamp,
          type: 'support',
          subtype: 'cardio',
          minutes: typeof data.duration === 'number' ? data.duration : null,
          duration: FieldValue.delete(),
          exercises: [],
          cardioType: data.cardioType ?? null,
          distance: data.distance ?? null,
          distanceUnit: data.distanceUnit ?? null,
          notes: data.notes ?? '',
        },
      };

    case 'yoga':
    case 'pilates':
      // Not deleted, not converted — flagged so every query can exclude them.
      // They still get schemaVersion 2 so a re-run skips them like everything
      // else; their own fields (type, duration, style, focus) are untouched.
      return {
        action: 'migrate',
        kind: 'archived',
        update: { ...stamp, archived: true },
      };

    default:
      return { action: 'unknown', reason: `unrecognised type: ${JSON.stringify(data.type)}` };
  }
}

// ── Reporting ──────────────────────────────────────────────────────────

/** FieldValue sentinels expose `methodName`; older majors used `_methodName`. */
function sentinelName(value) {
  if (!value || typeof value !== 'object') return null;
  return value.methodName || value._methodName || null;
}

function preview(value) {
  if (value === null) return 'null';
  const sentinel = sentinelName(value);
  if (sentinel) return `<${sentinel}>`;
  if (Array.isArray(value)) return value.length ? JSON.stringify(value) : '[]';
  if (typeof value === 'object') return JSON.stringify(value);
  return JSON.stringify(value);
}

function printDiff(id, data, update) {
  console.log(`\n  ${id}   (${data.date || 'no date'})`);
  for (const [k, v] of Object.entries(update)) {
    const had = Object.prototype.hasOwnProperty.call(data, k);
    const before = had ? preview(data[k]) : '—';
    const after = preview(v);
    if (before === after) continue;
    const arrow = sentinelName(v) === 'FieldValue.delete' ? 'DELETE' : after;
    console.log(`      ${k.padEnd(16)} ${before}  ->  ${arrow}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function resolveUids() {
  if (uidFlag) return [uidFlag];
  // listDocuments() returns references for users/{uid} even where the parent
  // document does not exist but has subcollections underneath it.
  const refs = await db.collection('users').listDocuments();
  return refs.map(r => r.id);
}

async function main() {
  console.log(COMMIT
    ? '\n*** COMMIT MODE — this will write to Firestore ***\n'
    : '\nDRY RUN — nothing will be written. Re-run with --commit to apply.\n');

  const uids = await resolveUids();
  if (uids.length === 0) {
    console.log('No users found under /users. Nothing to do.');
    return;
  }
  console.log(`Users: ${uids.join(', ')}\n`);

  const totals = { mat: 0, lifting: 0, cardio: 0, archived: 0, skipped: 0, unknown: 0 };
  const problems = [];
  let written = 0;

  for (const uid of uids) {
    const snap = await db.collection('users').doc(uid).collection('sessions').get();
    console.log(`── ${uid}: ${snap.size} session document(s) ──`);

    let batch = db.batch();
    let ops = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const result = mapDoc(data);

      if (result.action === 'skip') { totals.skipped++; continue; }

      if (result.action === 'unknown') {
        totals.unknown++;
        problems.push(`${docSnap.id}: ${result.reason}`);
        console.log(`\n  ${docSnap.id}   SKIPPED — ${result.reason}`);
        continue;
      }

      totals[result.kind]++;
      printDiff(docSnap.id, data, result.update);

      if (COMMIT) {
        batch.update(docSnap.ref, result.update);
        ops++;
        if (ops >= BATCH_LIMIT) {
          await batch.commit();
          written += ops;
          console.log(`\n  … committed ${ops} writes`);
          batch = db.batch();
          ops = 0;
        }
      }
    }

    if (COMMIT && ops > 0) {
      await batch.commit();
      written += ops;
      console.log(`\n  … committed ${ops} writes`);
    }
    console.log('');
  }

  // ── Summary ──
  const line = '─'.repeat(46);
  console.log(line);
  console.log('Summary by type');
  console.log(line);
  console.log(`  bjj      -> mat                    ${totals.mat}`);
  console.log(`  lifting  -> support/lifting        ${totals.lifting}`);
  console.log(`  cardio   -> support/cardio         ${totals.cardio}`);
  console.log(`  yoga/pilates -> archived           ${totals.archived}`);
  console.log(`  already v2, skipped                ${totals.skipped}`);
  console.log(`  unrecognised, left alone           ${totals.unknown}`);
  console.log(line);
  const touched = totals.mat + totals.lifting + totals.cardio + totals.archived;
  console.log(COMMIT
    ? `  ${written} document(s) written.`
    : `  ${touched} document(s) would be written. Nothing was.`);

  if (problems.length) {
    console.log('\nDocuments left alone because their type was not recognised:');
    problems.forEach(p => console.log(`  - ${p}`));
    console.log('Check these by hand before treating the migration as done.');
  }

  // ── Remaining v1 count — the app expects v2 only, so this must reach 0 ──
  let remaining = 0;
  for (const uid of uids) {
    const after = await db.collection('users').doc(uid).collection('sessions').get();
    remaining += after.docs.filter(d => d.data().schemaVersion !== 2).length;
  }
  console.log(`\n  Documents still below schemaVersion 2: ${remaining}`);
  if (remaining > 0) {
    console.log(COMMIT
      ? '  Do NOT deploy the app until this is 0 — reads expect v2.'
      : '  This is a dry run, so that number is expected to be non-zero.');
  } else {
    console.log('  Safe to deploy.');
  }
  console.log('');
}

main().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
