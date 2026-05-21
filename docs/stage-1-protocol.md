# iPlay · Stage 1 Gesture Probe Protocol

The foundational dataset that answers: **what can the iPhone actually sense, and which gestures are separable in raw sensor space?**

## Why this exists

Stage 1 is a research stage. Before designing any instrument mapping, we need a labeled dataset of canonical gestures recorded under controlled conditions across all three harnesses (web, RN, iOS). The analysis notebook reads this dataset and produces a separability report.

## Setup

- One iPhone, one user (Carlos), one recording session per evening.
- Quiet environment. Phone fully charged. Airplane mode optional (reduces background CPU).
- Recording duration per rep: **10 seconds.**
- Reps per gesture per platform: **10.**
- Total target: 10 gestures × 10 reps × 3 platforms = **300 sessions.**

## Recording protocol

For each gesture below:

1. Select the gesture label in the harness UI.
2. Hold the starting position for 1 second before tapping REC.
3. Perform the gesture for ~10 seconds, naturally and consistently.
4. Tap STOP.
5. Repeat ×10. Vary slightly across reps (different speed, different amplitude) — we want variance, not robotic repetition.
6. Export the JSON batch. Upload to `gi_.session` via the Supabase RPC.

## The ten probes

### 01 · noise_floor_flat
Phone face-up on a flat hard surface. Do not touch. Walk away if possible.
**What this measures:** sensor noise floor. Sets the lower bound for what counts as "real" motion.

### 02 · noise_floor_held
Phone held normally in dominant hand, screen visible, arm relaxed. Sit still and breathe.
**What this measures:** human tremor + hand noise. The "real" baseline that any gesture must rise above to be detectable.

### 03 · trombone_slide
Phone gripped along the long axis, pointing forward like a trombone slide. Extend arm forward and back smoothly. ~1 second per slide cycle.
**What this measures:** linear translation along one axis. Dominated by user_accel on the forward axis.

### 04 · guitar_strum
Phone held vertical against the torso, screen facing left/right. Strum with wrist — small arcs in the plane parallel to your chest.
**What this measures:** rotational gestures around the pitch axis with a characteristic small linear component.

### 05 · shaker
Grip the phone end-to-end. Shake along the long axis like a salt shaker. Fast.
**What this measures:** high-frequency acceleration along one axis. Most extreme noise/signal ratio of the probes.

### 06 · conducting_arc
Phone in hand, large slow figure-8 in the air at chest height. Smooth, continuous, ~3 seconds per loop.
**What this measures:** slow continuous attitude change with low acceleration. Theremin-like inputs depend on this being separable from noise.

### 07 · tap_strike
Sharp wrist flicks, as if striking a drum. ~1 strike per second. Phone briefly accelerates then settles.
**What this measures:** transient detection. Onset latency and peak detectability.

### 08 · theremin_pitch
Slow vertical raise and lower of the phone. Arm extended. ~3 seconds per up-down cycle.
**What this measures:** vertical position inferred from sustained acceleration patterns. Tests whether position can be reconstructed despite drift.

### 09 · theremin_volume
Slow horizontal sweep, left to right and back. ~3 seconds per cycle.
**What this measures:** horizontal position. Same drift question, different axis.

### 10 · rotate_in_place
Phone stationary in palm, rotated around each axis individually: roll for 3 sec, pause, pitch for 3 sec, pause, yaw for 3 sec.
**What this measures:** pure rotational data with minimal translation. Validates attitude/gyro independence from accelerometer.

## After recording

Run `analysis/01-separability.ipynb` on the captured set. The notebook produces:

- **Per-probe stats:** measured Hz, mean/std/peak per axis, dominant frequency (FFT).
- **Pairwise separability matrix:** how distinguishable is each gesture from every other gesture in raw sensor space? Cosine distance on feature vectors. Used to decide Stage 2 architecture.
- **Platform comparison:** does web's 60Hz limit hide gestures that native's 100Hz catches? This is the deciding evidence for whether the web harness is good enough for production or just for prototyping.

## Decision gate

After the dataset is captured and analyzed, the **Gate 4 decision** is:

- **Path A (grip-identity):** if shaker / trombone_slide / guitar_strum / conducting_arc / theremin variants are all separable with > 0.7 cosine distance pairwise, the phone *can* tell what instrument it's being played as. Build the auto-detect grip classifier.
- **Path B (explicit instrument):** if separability is weaker, user picks the instrument in the UI and the gesture space is mapped within that instrument. Still musical, simpler engineering.

Either is a real product. The data tells us which one to build.
