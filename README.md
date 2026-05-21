# iPlay

Turn the iPhone into a gestural instrument. Hold it like a trombone, sound like a trombone. Hold it like a guitar, sound like a guitar. Shake it, get percussion. Layer them with a looper.

This repo is the Stage 1 research harness — it doesn't make any sound yet. It exposes every motion, orientation, and (eventually) camera signal the iPhone produces, so we can answer the question that determines everything downstream: **which gestures are actually separable in sensor space?**

## Stages

1. **Sensor harness** ← *we are here.* Web, RN, and iOS implementations writing the same JSON schema. Capture the gesture probe battery. Analyze separability.
2. **Instrument synthesis.** Map sensor space to audio. Either grip-identity (auto-detect instrument from how the phone is held) or explicit-select, depending on Stage 1 findings.
3. **Camera fusion.** Add the front camera as a second-hand input via Vision / MediaPipe. Latency-sensitive; depends on Stage 2 audio engine.
4. **Live looper.** Layer trombone melody over bass over percussion. Real-time multi-track recording.

## Repo layout

```
iplay/
├── harness-web/         Single-file HTML harness. Deploys to Vercel.
├── harness-rn/          Expo. (not yet scaffolded)
├── harness-ios/         Swift + CoreMotion. (not yet scaffolded)
├── analysis/            Jupyter notebooks. (not yet scaffolded)
├── shared-schema/       JSON schema. All three harnesses write this format.
├── supabase/            Migrations for the gi_ schema in dryu-venture.
└── docs/
    └── stage-1-protocol.md       The gesture probe battery.
```

## Get the web harness running tonight

```bash
cd harness-web
# Serve with anything that gives you https — iOS won't grant motion access over http.
# Quickest path: deploy to Vercel.
npx vercel --prod
```

Open the resulting URL on your iPhone. Tap "Request access." Accept the motion prompt. You should see live charts for accelerometer, user-acceleration, and gyroscope, plus a 3D phone visualization driven by orientation.

To capture a probe:
1. Pick a gesture from the dropdown.
2. Tap REC, perform the gesture for ~10s, tap STOP.
3. Repeat the protocol in `docs/stage-1-protocol.md`.
4. Tap the ⇩ button to export sessions as JSON.

## Supabase

Apply the migration to `dryu-venture`:

```bash
supabase link --project-ref jlbfoizasfrywrpnlobh
supabase db push
```

This adds the `gi_` schema with `session`, `sample`, and `ingest_session()` RPC.

## Status

- [x] Web harness — live sensor visualization, recording, JSON export, localStorage persistence.
- [x] Shared JSON schema.
- [x] Supabase `gi_` schema migration with ingest RPC.
- [x] Stage 1 gesture probe protocol.
- [ ] Web harness → Supabase ingestion wired up.
- [ ] RN harness.
- [ ] iOS harness.
- [ ] Analysis notebook: separability matrix.
