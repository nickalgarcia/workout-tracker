# scripts/

One-off maintenance scripts. These run on your machine against the live
Firestore project via the **Firebase Admin SDK** — not through the web app.

## Why scripts/ has its own package.json

`functions/` also depends on `firebase-admin`, but the two have genuinely
different lifecycles: `functions/` is deployed to Cloud Functions and its
dependency versions affect production; `scripts/` runs locally and only ever
touches data by hand. Sharing one tree would mean a version bump for a
migration script could ripple into a deployed function. They are kept apart.

(Incidentally, `functions/package.json` lists `firebase-admin` but
`functions/index.js` never requires it — the coach function calls the
Anthropic API over plain `https`. That dependency is dead *there*, but do not
remove it as part of this work; leave one change per commit.)

## Setup

You need a service-account key. Do this once:

1. Firebase Console -> gear icon -> **Project settings** -> **Service accounts**
2. Click **Generate new private key** -> confirm. A JSON file downloads.
3. Move it somewhere OUTSIDE this repo. Recommended:

   ```sh
   mkdir -p ~/.config/mat-log
   mv ~/Downloads/workout-tracker-c1205-firebase-adminsdk-*.json \
      ~/.config/mat-log/serviceAccountKey.json
   chmod 600 ~/.config/mat-log/serviceAccountKey.json
   ```

   Keeping it outside the repo is the safe default. `.gitignore` and the
   hosting `ignore` list both cover the obvious filenames if you do put it in
   `scripts/`, but neither is worth relying on for a private key.

4. Install deps:

   ```sh
   cd scripts && npm install
   ```

That key grants **full admin access** to the project. It bypasses all
Firestore security rules. Treat it like a password.

## migrate-v2.js

Converts `users/{uid}/sessions` to `schemaVersion: 2` as defined in
[../docs/SCHEMA.md](../docs/SCHEMA.md).

**It defaults to a dry run.** Nothing is written unless you pass `--commit`.

```sh
cd scripts
export GOOGLE_APPLICATION_CREDENTIALS=~/.config/mat-log/serviceAccountKey.json

# 1. Dry run — prints a before/after for every document, writes nothing.
node migrate-v2.js

# 2. Read the output. When it looks right:
node migrate-v2.js --commit
```

`--uid=<uid>` restricts it to one user; without it, every user under
`/users` is processed (there is one).

### What it does

| v1 | v2 |
|---|---|
| `type: 'bjj'` | `type: 'mat'`, `duration` -> `minutes`, techniques normalised to `{name, link?}` |
| `type: 'lifting'` | `type: 'support'` / `subtype: 'lifting'`, `minutes: null`, `plan` and `planLabel` deleted |
| `type: 'cardio'` | `type: 'support'` / `subtype: 'cardio'`, `duration` -> `minutes` |
| `type: 'yoga'` or `'pilates'` | `archived: true`, otherwise untouched — not deleted |

Fields that v1 never recorded (`rounds`, `positions`, `focusId`,
`focusAttempted`, `worked`, `beat`, `readiness`) are set to null or empty.
No data is invented.

Every migrated document also gets `schemaVersion: 2` and `migratedAt`.
That includes the archived yoga/pilates ones — they keep their own fields,
but carrying the stamp is what lets a re-run skip them.

### Safety

- **Idempotent.** Anything already at `schemaVersion: 2` is skipped, so
  re-running is a no-op. Verified by running it twice.
- **Batched**, 400 writes per batch (Firestore caps at 500).
- **Unrecognised types are left alone**, listed by id at the end. It will
  not guess at a document it does not understand.
- It finishes by counting documents still below `schemaVersion: 2`. The app
  reads v2 only, so **do not deploy until that number is 0.** If it is not,
  the remaining documents are listed above it.

### After it runs

Check the Firebase console, then load the app. Sessions that did not
migrate render as `NOT MIGRATED` cards and log a console warning naming the
document — they will not fail silently.

## fetch-live-rules.js

Downloads the Firestore rules currently deployed to the project so you can
diff them against `firestore.rules` before overwriting anything.

```sh
cd scripts
GOOGLE_APPLICATION_CREDENTIALS=~/.config/mat-log/serviceAccountKey.json \
  node fetch-live-rules.js

cd .. && diff -u firestore.rules.live firestore.rules
```

If the service account lacks permission, grant it **Firebase Rules Viewer**
in the Google Cloud console (IAM), or just copy the rules manually — see
below.

### Manual fallback (no setup required)

Firebase Console -> **Firestore Database** -> **Rules** tab. The editor shows
the live source. Select all, copy, and paste into `firestore.rules.live`:

```sh
pbpaste > firestore.rules.live
diff -u firestore.rules.live firestore.rules
```

That tab also has a **version history** panel if you want to see what changed
and when.
