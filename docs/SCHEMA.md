# Firestore schema

`schemaVersion: 2`

Everything lives under `users/{uid}/`. There is one real user; Google
sign-in exists for cross-device sync, not multi-tenancy.

```
users/{uid}/
  sessions/{sessionId}     one training session — mat or support
  meta/focus               the active focus (see the focus feature)
```

There are **two session types**. Jiu-jitsu is the point of the app; lifting
and cardio are support work that exists to serve the mat game.

---

## Mat session

```js
{
  schemaVersion: 2,
  type: 'mat',
  date: 'YYYY-MM-DD',              // local calendar date, not a timestamp
  minutes: number,                 // total session length
  rounds: number | null,           // rolling rounds, separate from total time
  sessionType: 'drilling' | 'sparring' | 'both',
  positions: string[],             // fixed vocabulary — see POSITIONS below
  techniques: [{ name: string, link?: string }],
  focusId: string | null,          // which focus was active when this was logged
  focusAttempted: 'yes' | 'partly' | 'no' | null,
  worked: string,                  // "what worked" — short free text
  beat: string,                    // "what beat me" — short free text
  readiness: 1 | 2 | 3 | 4 | 5 | null,
  notes: string,
  createdAt: serverTimestamp
}
```

### positions vs. techniques

This distinction is the whole point of the schema, so it is worth being
explicit about.

**`positions` is a closed vocabulary.** It is a multi-select from the fixed
list below and nothing else — never free text, never a write-in. That is what
makes it aggregate: position coverage over 30 days is only meaningful if
"Half guard (bottom)" is spelled exactly one way across every session.

**`techniques` stays free text**, because that is where the nuance lives.
"Kimura from half guard when he posts the far hand" is not a taxonomy entry,
and forcing it into one would destroy the detail worth keeping.

### POSITIONS

Exported as a constant. **Order matters** — it is the display order, and it
runs roughly from bottom/defensive through to top/offensive.

```js
'Pre-guard / seated'
'Closed guard (bottom)'
'Half guard (bottom)'
'Open guard (bottom)'
'Guard passing (top)'
'Side control (top)'
'Side control (bottom)'
'Mount (top)'
'Mount (bottom)'
'Back attacks'
'Back defense'
'Standing / takedowns'
```

Adding a position later is fine. Renaming or reordering one is not free —
existing documents store the string, so a rename orphans past sessions
unless they are migrated too.

---

## Support session

```js
{
  schemaVersion: 2,
  type: 'support',
  subtype: 'lifting' | 'cardio',
  date: 'YYYY-MM-DD',
  minutes: number,
  exercises: [{ name, sets: [{ reps, weight }] }],   // lifting only
  cardioType: string | null,                          // cardio only
  distance: number | null,
  distanceUnit: 'miles' | 'km' | null,
  notes: string,
  createdAt: serverTimestamp
}
```

`reps` and `weight` are stored as **strings**, as typed into the form. That
is inherited from v1 and left alone deliberately — the progress view already
parses them with `parseFloat`/`parseInt`, and changing it would mean touching
every historical set.

---

## Archived documents

Yoga and pilates sessions are no longer supported. The migration sets
`archived: true` on them rather than deleting them, and **every query in the
app excludes archived documents**. They are kept only so the history is not
destroyed.

---

## Fields dropped in v2

| v1 field | Fate |
|---|---|
| `type: 'bjj'` | becomes `type: 'mat'` |
| `type: 'lifting'` | becomes `type: 'support'`, `subtype: 'lifting'` |
| `type: 'cardio'` | becomes `type: 'support'`, `subtype: 'cardio'` |
| `duration` | renamed `minutes` |
| `plan`, `planLabel` | dropped — the Daredevil day-1/day-2 split is not carried into v2 |
| `style`, `focus` | yoga/pilates only; those docs are archived, not migrated |

---

## Known gaps

These are places where the schema is ahead of the UI. They are intentional,
not oversights.

- **`minutes` on lifting sessions is `null`.** The lifting form has no
  duration input — v1 never collected one. New lifting sessions therefore
  write `null` until a field is added. Cardio and mat sessions both have a
  real minutes input.
- **`positions`, `rounds`, `worked`, `beat`, `readiness`, `focusId` and
  `focusAttempted` are written empty/null** by the current mat form, which is
  still the old BJJ form. The rebuilt mat form collects them.
