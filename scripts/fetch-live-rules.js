#!/usr/bin/env node
/**
 * fetch-live-rules.js — download the Firestore rules currently deployed to
 * this project and write them to firestore.rules.live for diffing.
 *
 * There is no `firebase firestore:rules:get` in the Firebase CLI. The
 * supported programmatic route is the Admin SDK's SecurityRules API, which
 * is what this uses.
 *
 * Usage:
 *   cd scripts && npm install
 *   GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/serviceAccountKey.json \
 *     node fetch-live-rules.js
 *
 * Writes: ../firestore.rules.live  (gitignored — it is a snapshot, not source)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const PROJECT_ID = 'workout-tracker-c1205';
const OUT = path.join(__dirname, '..', 'firestore.rules.live');

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      'GOOGLE_APPLICATION_CREDENTIALS is not set.\n' +
      'Point it at a service-account JSON key with Firebase Rules read access.\n' +
      'See scripts/README.md for how to create one.'
    );
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });

  const ruleset = await admin.securityRules().getFirestoreRuleset();

  console.log(`ruleset:  ${ruleset.name}`);
  console.log(`created:  ${ruleset.createTime}`);
  console.log(`files:    ${ruleset.source.length}`);

  if (ruleset.source.length !== 1) {
    console.warn(
      `\nHeads up: this ruleset has ${ruleset.source.length} source files ` +
      `(${ruleset.source.map(f => f.name).join(', ')}). ` +
      `Only the first is written out.`
    );
  }

  fs.writeFileSync(OUT, ruleset.source[0].content, 'utf8');
  console.log(`\nwrote ${OUT}`);
  console.log('\nNow diff it against the proposed rules:');
  console.log('  diff -u firestore.rules.live firestore.rules');
}

main().catch(err => {
  console.error('\nFailed to fetch live rules:', err.message);
  if (err.code === 'app/invalid-credential' || /PERMISSION_DENIED/.test(err.message)) {
    console.error(
      '\nThe service account likely lacks the Firebase Rules Viewer role.\n' +
      'Grant roles/firebaserules.viewer, or just copy the rules out of the\n' +
      'console instead — see scripts/README.md.'
    );
  }
  process.exit(1);
});
