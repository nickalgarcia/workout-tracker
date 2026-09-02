# Mat Log

A personal jiu-jitsu training log. Mat sessions are the point; lifting and
cardio are support work that exists to serve them.

Single user, no build step, no framework. Vanilla ES modules, Firebase Auth
+ Firestore, deployed to Firebase Hosting as a PWA.

## What it does

- **Current focus.** One thing you're working on at a time — "closed guard:
  overhook + head control". The dashboard shows how many weeks it's been
  active and how often you actually got to it. Ending a focus archives it
  with its final attempt rate, so the history is a record of what you
  worked on and whether you got to it.
- **Mat log.** Built to be finished in under 45 seconds one-handed in a
  parking lot: readiness, minutes, rounds, position chips from a fixed
  vocabulary, whether you reached your focus, what worked, what beat you.
- **Problem log.** Every "what beat me" entry, newest first, with recurring
  themes counted. This is the curriculum.
- **Position coverage.** Which positions you're actually training over 30
  or 90 days, including the ones at zero.
- **Coach.** A Cloud Function that sends your focus, your last 20 mat
  sessions, your problem-log themes and your position coverage to Claude,
  with instructions to reference actual sessions and dates and to give two
  or three concrete things to try next time.

## Layout

```
index.html            markup for every view; no inline handlers
manifest.json         PWA manifest
service-worker.js     offline cache — STATIC_FILES must list every module
deploy.sh             stamps a cache version, then deploys hosting
icons/                app icons, 192 and 512

css/styles.css        all styles

js/main.js            entry point: view registry, boot wiring, auth state
js/db.js              Firebase init, auth, every Firestore read and write
js/ui.js              shell — navigation, toasts, dirty-form guard,
                      helpers, session cards and detail, dashboard, history
js/mat.js             the mat session form
js/support.js         lifting and cardio forms
js/focus.js           focus card, focus view, history
js/progress.js        problem log, position coverage, support work
js/coach.js           coach view, chat, context assembly

functions/index.js    getCoachingAdvice — the only server-side code
scripts/              one-off maintenance scripts (see scripts/README.md)
docs/SCHEMA.md        Firestore schema — read this before touching data
firestore.rules       security rules, version-controlled
```

`index.html` loads `js/main.js` and nothing else; everything else is
reached through ES module imports. The dependency graph is acyclic:
`db.js` imports nothing local, everything else imports `db.js`, and only
`main.js` imports the feature modules. Where a feature needs to reach back
into the shell — a view initialiser, the dashboard's focus card — it
registers itself with `ui.js` rather than being imported by it.

## Running locally

No build step. Serve the directory and open it:

```sh
python3 -m http.server 8000
```

Then <http://localhost:8000>. Google sign-in works on localhost and talks
to the live Firestore, so this is the real data.

## Data migration

The schema is at version 2 (`docs/SCHEMA.md`). Sessions written by the
original version need converting, and **the app reads v2 only** — it will
show unmigrated sessions as `NOT MIGRATED` cards rather than guessing.

```sh
cd scripts && npm install
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/mat-log/serviceAccountKey.json

node migrate-v2.js            # dry run — prints every change, writes nothing
node migrate-v2.js --commit   # actually writes
```

It defaults to a dry run, is safe to re-run, and finishes by counting
documents still below schemaVersion 2. **Do not deploy until that is 0.**
Service-account setup is in `scripts/README.md`.

## Deploying

```sh
./deploy.sh
```

Use the script rather than `firebase deploy` — it stamps a fresh
`CACHE_VERSION` into the service worker, which is what evicts the old
module graph from the home-screen app. Without it you can get a stale mix
of old and new modules.

The script is macOS-only (BSD `sed -i ''`); see the comment in it.

Security rules and the Cloud Function deploy separately:

```sh
firebase deploy --only firestore:rules
firebase deploy --only functions
```

The coach function needs the `ANTHROPIC_API_KEY` secret:

```sh
firebase functions:secrets:set ANTHROPIC_API_KEY
```

## Editing the profile

There is no settings screen. `PROFILE` at the top of `js/db.js` is the
whole thing — name, belt, style, build, goals, weekly targets. Edit it by
hand and redeploy. It feeds the greeting, the week-balance line and the
coach's context.
