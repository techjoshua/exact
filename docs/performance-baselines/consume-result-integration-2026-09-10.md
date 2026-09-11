# Result finalization integration, September 10, 2026

Status: integrated and functionally validated candidate. HTTP performance
acceptance remains pending; the overall React comparison goal remains unmet.

The [prototype](consume-result-2026-09-10.md) showed favorable small-document
timing directions on both runtimes and approximately 1.2% lower sampled Node
allocation. Those results motivate this integration, not a claim that the rebuilt
candidate has established an HTTP gain.

## Ownership review and implementation

There is one production caller of the internal finalizer, in renderHydratableOutput.
It receives the completed result from its private renderOwnedOutput invocation,
uses it to prepare hydration options, and transfers it directly into finalization.
No public caller receives the intermediate object. Component cleanup completes
inside renderOwnedOutput before this finalization.

The helper is now named finishHydratableResult. Its documented contract consumes
an exclusively owned intermediate result once. It validates document insertion
before mutation, preserves existing HTML/state/metadata, installs shared own lazy
hydration and resumption accessors, and returns the same object. It adds the script
using an own data descriptor, avoiding inherited setter interception.

The old test that finalized the same input twice now uses independent inputs.
It checks transfer identity, independent publication, deferred resumption reads,
metadata preservation, frozen preload links, and ordinary spread behavior.
Malformed document tests also verify rejection before adding public properties.
Existing exhaustive chunk-split hydration insertion tests remain intact.

Public property names and reads remain available; enumeration now puts existing
HTML, state and metadata before hydration fields. Engineering and initial-release
guidance record this representation change. The public docs application's named
property examples remain accurate and were not churned for an internal ownership
change. No compiler helper signature, artifact meaning, or ABI epoch changes.

## Validation

- All 360 SSR tests across 57 files pass.
- SSR package build and comparison client/Node/Bun builds pass.
- All 56 browser checks pass, 14 each for Node/Bun string/stream, including both
  framework applications, hydration, interactions and controlled-service failures.
- Test typechecking, targeted ESLint and source formatting pass.
- Source architecture, JSDoc and release ABI checks pass, retaining epoch 1 at 0.5.0.

The full compiled-ABI fixture suite and HTTP benchmarks were not rerun in this
checkpoint. No frozen fixtures were modified. Test output contains existing
MaxListenersExceeded warnings from the harness; all tests completed successfully.
Owned browser/server processes exited; only the user's Codex Node process remained.

Rebuilt Node artifact SHA-256: `a8b8db9c44f62d0f42c0ebd69d932c3e36ec6b77234f62ae102d1e09a4c4820b`.

Rebuilt Bun artifact SHA-256: `96d6af2a10b08f1f30f81bab130f6b56daa2671e68145c3dcef2a4cef0714eb2`.

The next measurement compares these exact artifacts with the previous retained
build and React in short interleaved HTTP blocks, across both runtimes and modes.
The adjacent archive preserves source snapshots, artifacts, build/test/typecheck
and browser logs, documentation, and a verified SHA-256 manifest.

Follow-up: [HTTP acceptance](consume-result-http-2026-09-10.md) rejected this candidate for a consistent Node string regression. The previous implementation and canonical artifacts are restored.
