# Independent enhancement target implementation evidence

**Broader performance acceptance is open.** The
[before/after comparison](enhancement-performance-comparison.md) initially found SSR and client
regressions. Runtime and compiler optimizations now show lower latency medians and consistently
faster hydration in the final isolated comparison. Some SSR timings remain variable. Bundle growth,
Intl comparison, and browser measurements
remain open. The same-runtime budgets below did not establish regression safety; use the comparison
report for current evidence and measurement limits.

## Contract and implementation

The [target-selection design](proposals/independent-enhancement-target-selection.md) separates
namespace selection, supplied-child placement, owned contributions, and local root observation.
It is implemented across the compiler, core, DOM, SSR, hydration, and component libraries.

Receiving components need no build-time knowledge of incoming enhancements, including default
enhancements. Host creation is a runtime decision. Only a resolved fragment target whose
enhancement contributes additional `_target` props receives a span. Ordinary fragments,
contribution-free enhancements, and scalar Text targets stay transparent. Existing intrinsics
receive contributions directly. Enhance an explicit `_` around a text range when it needs a host.

Self-closing `_target` places one supplied logical child. Namespace roots independently select
targets; placement does not export a preference to unrelated parents. Explicit empty roots remain
dormant. Duplicate active roots and simultaneous placements fail before publication. Static
`namespace:intrinsicFragment` selects another tag without activating an enhancement. Consecutive
compatible contributors share one host while retaining independent owners. Structural output
preserves authored barriers and source order.

DOM retains namespace bindings and structural dependencies. Unrelated scalar updates do not
rediscover routes or reconcile the application enhancement tree. SSR uses compiler-indexed child
slots and request-owned component output. Hydration reconstructs routes before adopting nodes.
Failed unpublished attempts restore fallback claims. Target discovery never executes a receiving
component twice.

Preparation captures real enhancement output before committing placement. Host planning consumes
captured contributions; refs and mount callbacks wait for publication. Failed or abandoned
preparation releases its owner once. Ordinary mounts allocate no preparation record. Structural
changes transfer surviving scopes before disposing wrappers. Exclusive target-placement branch
moves retain supplied DOM and component instances.

## Acceptance coverage

The composition corpus covers authored TSX, independent namespaces, explicit/fallback roots,
projected-child ownership, enhanced enhancements, transparent/structural peers, mixed tags,
host insertion/removal, refs/events/control bindings, context order, and marked/markerless hydration.
Activity parking and lazy Suspense cancellation retain ownership and prevent stale publication.
Exclusive placement moves preserve identity through mounting and hydration, reject duplicates,
recover, and dispose the final supplied owner once.

Separately compiled unaware receivers have plain, passive, and default-contributing invocations.
Only the contributing fragment invocation creates a host. A nested scalar receiver separately
protects Text-target transparency through mount, SSR, and hydration.

Real Intl message, currency, unit, plural, and select components run under their provider through
string/stream SSR, hydration, value changes, and locale changes in div, title, and textarea hosts.
Rich intrinsic slots and opaque controls retain identity across translation while locale and
translated attributes share one span. Nested explicit locales remain independent of an outer
locale change. Analyzer/build suites protect extraction, keys, catalogs, and generated artifacts.

Title and textarea projections serialize materialized markup as literal host text. They create
no child Elements, Element refs, or Element listeners and never promote props to the parent.
Existing text ownership and edited textarea values are preserved. This is not HTML or
application-intent validation.

Validation exposed framework defects that were fixed at their owners: exported
`IntlMessage.call(this, props)` forwarding retains the server context surface; imported native
components do not inherit a client-only boundary from their caller's lifecycle; later compiled
child reads retain the original component domain and rich-slot identity.

## ABI and release ownership

| Surface                                 | Responsibility                                                             |
| --------------------------------------- | -------------------------------------------------------------------------- |
| Compiler and six paired native packages | Root/slot metadata, contribution facts, lowering, diagnostics.             |
| Core                                    | Receipts, contracts, preparation, contribution ownership, host planning.   |
| DOM                                     | Bindings, placement, hosts, cleanup, text projection.                      |
| SSR                                     | Request-local selection, prepared output, layers, streaming.               |
| Hydrate                                 | Reconstructing routes/owners and retaining server DOM.                     |
| Remaining shared ABI providers          | Coordinated migration from the authoritative provider manifest.            |
| Dependent packages                      | Publication follows changed public manifests, not validation impact alone. |
| Docs and composition corpus             | Private authoring guidance and acceptance consumers.                       |

Shared ABI epoch 2 and component/render-program contract version 2 require providers and their
necessary dependency closure to move to 0.6.0. The authoritative provider set is
`scripts/contracts/release-abi.json`. Frozen 0.5.0 fixtures remain unchanged and are rejected before
execution. The unpublished 0.6.0 candidate covers SSR, hydration, keyed identity, tasks, and disposal.
See [release readiness](release-readiness.md). Implementation does not authorize publication.

## Reproducible measurements

After building the workspace:

```text
node --expose-gc scripts/benchmark-enhancement-presentation.mjs
node --expose-gc scripts/benchmark-enhancement-target-prototype.mjs
```

The production runner archives compiled fixtures, environment details, and raw samples under
`.tmp/enhancement-presentation`. It asserts host counts, receiving-owner lifetimes, scalar updates,
and retention of every server Element. The second runner measures isolated algorithms; its
linear-scan comparator is not a previous renderer.

September 18, 2026, Node 26.8.1, Windows x64, Ryzen 7 8745HS: 100 receivers, 10 updates of every
receiver, 3 warmups, 11 samples. Median times are milliseconds:

The table uses archived run `measurements-2026-09-18T10-31-46-898Z.json`.

| Population                    | Mount | Updates | Hydrate | SSR string | First byte | Stream | HTML bytes |
| ----------------------------- | ----: | ------: | ------: | ---------: | ---------: | -----: | ---------: |
| Plain fragments               |  2.61 |    6.29 |    3.25 |       0.65 |       0.64 |   0.65 |     17,484 |
| Enhanced intrinsic            | 21.77 |    8.23 |   19.86 |       3.65 |       2.79 |   2.81 |     46,904 |
| Explicit host/contributor     | 12.26 |    6.35 |   12.02 |       3.91 |       1.98 |   1.99 |     47,484 |
| Incoming fragment enhancement | 26.24 |   10.72 |   22.93 |       7.05 |       6.85 |   6.87 |     64,784 |
| Two coalesced contributors    | 32.41 |    9.75 |   27.17 |       7.06 |       8.68 |   8.69 |     92,888 |
| Transparent Intl              |  6.65 |   26.87 |    6.21 |       2.00 |       1.70 |   1.71 |     34,202 |
| Enhanced Intl fragment        | 27.34 |   26.63 |   23.61 |       8.33 |       7.92 |   7.93 |     88,508 |

Plain and transparent Intl create zero spans; all other populations contain exactly 100, including
two coalesced contributors. Incoming enhancement has measurable construction, hydration, and
serialization costs relative to explicit placement. These results do not establish a speedup.

Broad same-run smoke budgets are enhanced/plain update ratio below 3, enhanced/transparent Intl
updates below 2, enhanced/explicit mount below 5, and enhanced/explicit hydration below 3.
The measured ratios were 1.70, 0.99, 2.14, and 1.91. These catch large repeated-work regressions,
not small machine-dependent timing changes. Contract tests separately require zero redundant
discovery, host replacement, and receiving-owner remounts during unrelated scalar changes.
A subsequent verification run also passed all four budgets (1.72, 1.12, 2.12, and 1.78).

The combined production fixture bundles measure 869,805 client bytes (189,055 gzip) and 499,974
server bytes (113,181 gzip). These include every benchmark variant and Intl, so they are reproducible
artifact sizes, not the marginal download cost of target routing. Compiler capability tests and
platform-boundary checks separately protect optional enhancement imports.

Three batches of 100 mount/update/dispose cycles, each with 100 enhanced receivers, yielded
post-GC heap deltas of -2,957,720, -5,614,304, and -5,413,992 bytes from the warmed starting point.
Collection/JIT variation prevents treating these values as proof of leak freedom. Deterministic
lifetime and cancellation tests protect cleanup.

These are same-runtime controls, not a reconstructed pre-change baseline. No historical speedup
or regression percentage follows from them. JSDOM measures neither layout nor painting, and this
workload does not characterize every large catalog or asynchronous stream. Keep raw samples for
future comparisons and use browser workloads for application frame budgets.

## Validation commands

Final validation passed: 372 package test files, 2,207 tests (15 existing skips), 122 build-script
tests, native compiler suites, workspace build, test typechecking, lint, architecture/JSDoc/API
checks, platform and Intl boundaries, publication preflight, and documentation application
verification. The frozen 0.5.0 fixture has no diff. No packages were published.

```text
npm run build:native-compiler
npm run build:workspaces
npm run test:packages
npm run test:build-scripts
npm run typecheck:tests
npm run lint
npm run check:source-architecture
npm run check:jsdoc
npm run check:explicit-any
npm run check:core-api
npm run check:platform-boundaries
npm run check:intl-boundaries
npm run check:publish
npm run verify -w @exactjs/docs
```

SSR uses its ordinary TypeScript build. Core and DOM conditional outputs are rebuilt by
`compile-exact-package.mjs` before built-package consumers run. Native compiler suites include
React compatibility and native artifact boundary checks. Public documentation describes the
authoring contract; this report retains implementation and measurement details.

## Optional renderer dependencies

Plain mounting and adoption use small capability gates for text-host presentation and supplied
placement. Their implementations are installed by text-host artifacts, enhancement providers, or
Target integration. Selection belongs to the provider or authored host, never to an assumption that
a receiving component knows its incoming enhancements. Default, external, and lazy enhancements
therefore retain the same runtime behavior. No ordinary fragment is wrapped ahead of resolution.

Prepared component construction lives separately from ordinary mounting, so an unused preparation
implementation can be removed from a plain application bundle. The text-host revision counter uses
the object-only reactive entry and does not require reactive Map/Set support. The framework
comparison application rejects these unused implementations in its production bundle.

The [capability optimization report](performance-baselines/enhancement-capabilities-2026-09-18.md)
records paired browser memory, bundle sizes, timing, and V8 bytecode and shape inspection.

## Deliberately deferred APIs

No public receipt-to-instance API, target-export registry, or named capability protocol is added.
[Scoped child participation](proposals/cooperative-structured-children.md) remains exploratory.
Immediate-child composition uses `partitionChildren`, `childrenOf`, and `withChildren`;
enhancement discovery uses bounded framework-owned structure.
