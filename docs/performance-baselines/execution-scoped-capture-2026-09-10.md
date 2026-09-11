# Execution-scoped resumption capture, September 10, 2026

Retained internal ownership refactor. Reservation, publication, rollback, and scheduled publication
dependencies now use the capture carried in component execution options. `SsrContext` no longer
holds a second capture reference. Component boundary formatting records capture availability from
that execution. Existing public entry points continue to capture their requested root.

This is a prerequisite for a server-only enclosing shell with an independently hydratable
application. It does not yet add that shell API, exclude shell siblings, or scope the client-boundary
hydration table. The larger combined-shell gains remain diagnostic, and Node string remains behind
React in the last comparable HTTP measurement.

## Validation

The existing full SSR suite passed 365 tests in 57 files after the refactor. An additional regression
then passed in the focused 11-test program-sink suite. It renders a stateless parent with a scheduled
stateful descendant using one capture's options and another capture's shared output context. Only
the assigned execution capture receives state after suspension, and lifecycle cleanup runs once.
The old context-based lookup would publish to the other capture.

The SSR package was rebuilt with TypeScript and both comparison bundles were rebuilt. All 56 browser
checks passed across Node/Bun string/stream, including application and external-script DOM identity.
Test type checking, ESLint, source architecture, JSDoc, and frozen/initial ABI checks also passed.
No compiler helper signature, emitted artifact schema, or ABI epoch changed.

## Regression screen

Hypothesis: moving a field read from output context to already-passed execution options should be
roughly neutral; the purpose is correct scope ownership rather than a direct speed claim.

| Runtime | Order | Previous microseconds/render | Refactor microseconds/render |
| --- | --- | ---: | ---: |
| Node | Previous first | 42.13 | 42.94 |
| Node | Refactor first | 44.11 | 41.35 |
| Bun | Previous first | 30.96 | 33.18 |
| Bun | Refactor first | 35.63 | 34.14 |

The screen used eight fresh production processes, 50,000 warmup renders, 20,000 measured encoded
string renders per process, the portable Node bundle on both runtimes, and below-normal process
priority. The user continued using the PC. Both runtimes reversed direction between orders, so the
screen establishes neither a stable speed gain nor a stable regression. No React numbers were
remeasured in this screen.

All responses were byte-identical, 4,672 bytes, SHA-256
`0a81e47ed671b35c366ab1c60ed8592f2715c3ad235673e185fc199bf28af411`.
Unlike the prior literal-script experiment, this refactor changes the current normal bundle. Frozen
candidate artifacts and their hashes are preserved alongside the previous control.

[Evidence archive](execution-scoped-capture-2026-09-10-evidence.zip) contains sources, tests, build and
validation logs, browser results, artifacts, screen scripts/results, and a verified SHA-256 manifest.
The remaining architectural work is detailed in the
[document ownership audit](document-hydration-ownership-audit-2026-09-10.md).
