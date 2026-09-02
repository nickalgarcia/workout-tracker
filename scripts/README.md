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
