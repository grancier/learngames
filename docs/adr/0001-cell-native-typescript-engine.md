# ADR 0001 — Cell-native lesson engine in TypeScript, lessons-as-SDK

- **Status:** Accepted
- **Date:** 2026-06-30
- **Supersedes:** `RECONCILIATION.md` in the `learner` repo — dead provenance. It reconciled
  Gen-1 bytecode-VM / cell-grid artifacts that no longer exist and was explicitly demoted by
  later handoffs ("do not act on their rulings"). This ADR is the new, binding reconciliation.

## Context

Two repositories independently implemented the same idea and became competing answers to the
question *"what is a lesson?"*:

- **`learner`** (Rust) — a closed-vocabulary, imperative turtle/Processing language compiled to
  bytecode and run on a fuel-metered cooperative VM, distributed as a single auditable file.
  Moat: safe sharing of untrusted lessons (schools). Its `build_spec_v1.md` locked a
  **cell-native** model: a logical character grid, `Cell{glyph,fg,bg}`, the **changed-cell
  stream as the sole render output**, a kill-filter forbidding pixels / camera / smooth-scroll /
  blit / layers, fuel, and a five-outcome telemetry funnel. **Its code then drifted off that
  spec onto a 32-bit pixel framebuffer (LRN-003+)** — the exact engine the kill-filter forbids.
- **`learngames`** (TypeScript) — a pure SDK: a lesson is code written against typed
  `ChallengeSource` / `ProgressionPolicy` / `ContentPack` / `GraderRegistry` primitives.
  Moat: developer adoption.

A third, free-form Rust-trait lesson model also existed in `learner`. Three incompatible answers
to one question is the trichotomy this reconciliation had to collapse — and the choice is coupled
to runtime shape (an imperative VM needs fuel; declarative/SDK lessons do not) and to which repo
to evolve.

## Decision drivers

Two product answers collapsed the decision:

1. **"Score is enough; replay is not required."** This retires the most expensive third of the
   Rust spec — bitwise cross-target determinism (no-FMA / no-transcendentals on native + WASM),
   captured input-trace replay, a frame hash as a replay oracle, dual-clock fairness telemetry,
   and seed-recording. Determinism drops from a **contract** to a **convenience**: a seeded RNG
   so problem sets and mazes are reproducible while building and testing, nothing more.
2. **"Optimize for adoption, development, usability."** Combined with first-party SDK lessons (no
   untrusted code to sandbox) and flip-screen rooms (which keep the kill-filter intact), this
   removes fuel's and the bytecode VM's reason to exist — a runaway loop in first-party code is an
   ordinary dev bug caught by a cooperative watchdog, not a security boundary.

With determinism-grade portability and untrusted-sandboxing no longer required, the remaining
objective is exactly TypeScript's strength, and `learngames` already holds the most code.

## Decision

| Aspect | Decision |
|---|---|
| Language | **TypeScript end-to-end** — engine, lessons, and tooling |
| Repo | **Evolve `learngames`**; shelve `learner` as reference |
| Lesson model | **SDK** — a lesson is TypeScript code over the domain primitives + render intents |
| Runtime | **Pull-based** — advance a logical step on input or a coarse timer; no fixed 60 Hz loop, no fuel |
| Determinism | Seeded RNG for reproducibility; **not** a bitwise cross-target contract |
| Render substrate | Cell `Surface{glyph,fg,bg,bold}`, promoted from `learngames` core |
| Render contract | Changed-cell diff as a performance + adapter boundary, **not** a parity contract |
| Adapters | Browser **canvas** (primary, zero-install) + **terminal** (ANSI over any TTY / SSH) |
| Input | Normalized; **text/numeric entry is first-class** (no replay trace to protect) |
| Telemetry | `{lessonId, outcome, score, attempts}`; five-outcome lifecycle + first-event-wins latch retained |

### Retained from the cell-native thesis (product identity, independent of determinism)

The **kill-filter holds**: no pixel framebuffer, no camera, no smooth / sub-cell scroll, no
blit-layers. Render intents (banner, box / input-field, tilemap, sprite) compile to `Surface`
cells via pure functions, as a versioned closed set, with the kill-filter as an enforced
acceptance gate. The medium is intentionally chunky — 1-cell sprite steps, flip-screen room-cuts,
faux-3D banner extrusion. This portability and host-agnosticism is a property of the
**pure-core + adapter** architecture, not of any language; `learngames`' core already has zero
render dependencies, enforced by a test.

## Consequences

**Gained:** one language across engine/lessons/tooling; zero-install browser reach (the universal
client — Chromebook, tablet, school laptop); fast iteration (HMR, no FFI boundary); the largest
ecosystem; and reuse of the already-built, 100%-covered cell `Surface` plus the now-implemented
lesson domain.

**Consciously given up — all current non-requirements:** bitwise cross-target determinism and
replay; a hard VM sandbox for untrusted lessons; raw performance headroom (irrelevant at
cell-grid scale).

**Recoverability:** the architecture is language-agnostic (a pure core emits cells; adapters
inject input and output), so a Rust core port remains possible later **if** a schools/replay moat
returns — at which point a JS Worker/realm + watchdog is a lighter sandbox than a bytecode VM.

**Repo dispositions:** `learner`'s durable contributions inform the TS build — the five-outcome
lifecycle, the capability-seam discipline, and the cell-native banner technique proven by its
ratatui spike. Its pixel framebuffer is dead.

## Alternatives considered

- **A — Schools / safe distribution:** Rust core, closed-vocab bytecode VM, fuel, bitwise
  cross-target determinism. Highest cost and risk; justified only by an untrusted-sharing +
  replay moat, which both product answers waved off.
- **B — Developer adoption (chosen):** TypeScript, SDK lessons. Lowest cost; its weaker
  theoretical guarantees (no bitwise determinism, no hard sandbox) are non-requirements here.
- **C — Staged (declarative-only v1, defer the VM):** ruled out once the use cases showed that
  real-time per-tick imperative behavior (a letter-shooter, maze AI) cannot be a declarative
  spec. But with replay gone, that imperative logic is ordinary SDK code rather than a fuel-VM
  concern — which collapses C into B.
- **Greenfield:** rejected — it discards `learner`'s runtime spine and `learngames`' covered
  substrate to rebuild the easy 60% and skip the hard, already-done part.

## Build path

Each slice is TDD, matching the discipline already in the repo.

1. **Lesson domain** (`@learn-engine/lessons`) — pure primitives: ids, grading, generation,
   progression, i18n, content, session, persistence. ✅ **done** (commit `1fa255d`).
2. **Pull-based runtime** — logical step, normalized input (directional **+ text entry**), the
   lesson/session lifecycle + five-outcome latch, score telemetry. *(Goal-based progression —
   "lesson complete / goal achieved" — lands here, where it has a caller to anchor to.)*
3. **Render-intent library** — the closed set the use cases imply: banner (faux-3D shadow/flash),
   box / nested input field, tilemap (flip-screen rooms), sprite (cell-snapped). All compile to
   `Surface` cells; kill-filter enforced.
4. **Adapters** — browser **canvas** (primary; paint cells, diff for repaint) + **terminal**
   (alt-screen / raw-mode / diffed ANSI via the existing `rasterizeToAnsi`). Retire Ink.
5. **Worked games** — the UC1 math drill, then the UC2 flip-screen letter-speller, as the SDK
   extensibility proof.
