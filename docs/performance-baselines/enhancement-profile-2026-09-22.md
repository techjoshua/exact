# Enhancement workload CPU profiles, September 22, 2026

The existing workloads do not identify root discovery as the main remaining enhancement cost.
Component-root resolution accounts for 0.08–0.11% of mount samples and 4.23–4.40% of hydration
samples. Explicit-root scanning accounts for 0.40–0.43% of hydration samples. Client DOM operations,
reactive work, and server receipt/serialization construction are larger investigation targets.
This is attribution of the current implementation, not an optimization comparison.

The subsequent [Intl fallback-cache experiment](intl-fallback-cache-2026-09-22.md) tests the
locale-processing hotspot with paired timing and separate profiles. It does not replace this
pre-optimization attribution.

## Implementation and method

Framework source: `c8858f5a956ea2ca5475318356efd8c5ca457bb3`. Tracked source was clean before
instrumentation. The workspace was rebuilt and the native compiler build check confirmed its
cached executable was current. Framework production source remained unchanged. The measured
worktree adds optional benchmark phase observers, source-map output, and a profiling harness.
The SHA alone does not reconstruct those initially uncommitted diagnostic additions. The maintained
runner and fixture changes accompany this report; later runner validation additions do not alter
the measured fixture operations.

Environment: Node 26.9.0, JSDOM 25.0.1, Linux x64, WSL2 kernel `6.18.40.1-microsoft-standard-WSL2`, AMD Ryzen 7
8745HS. Bundles are unminified production compiler output. The client bundle is 877,798 bytes,
SHA-256 `393bda122f036378ec0d53466df382b916ce0ec61225750225ea17f547a1daf9`; server is 511,496 bytes,
SHA-256 `b1ee1bd8f90340807d2d043ff0b7bf6c0ba9b1004f027bcc0af93e422393d769`.
These are diagnostic fixture sizes, not application delivery sizes.

Two unprofiled protocol-2 runs precede profiling: 100 receivers, ten updates, 20 client warmups,
500 server warmups, and 21 samples per workload. Mount/update and hydration run in separate fresh
processes; SSR runs without a DOM. Two subsequent profiling passes reverse workload order, with
fresh processes for every workload/lane, 150 client or 1,000 server iterations after the same
warmups. No build, test, or other task-owned benchmark ran concurrently. This was not an isolated
machine; existing background services remained running.

The Node inspector requests a 100-microsecond CPU sampling interval. Monotonic phase windows retain
only mounting, scalar updates, hydration, string rendering, and stream rendering. Module loading,
warmup, parsing hydration input, assertions, and final client unmount are excluded. SSR includes
its normal request cleanup. Raw profiles still contain work outside the windows, so opening a
whole profile directly is not equivalent to reading its phase summary.

Percentages below are sample counts within a phase, not elapsed-time savings. Function rows are
inclusive of descendants and overlap. Module totals use self samples and are disjoint by module.
GC samples cannot identify the allocation site that caused collection. JIT attribution and sampling
resolution limit interpretation of tiny percentages and absent functions.
The 30 profiles contain 50 phase populations with 374,741 retained samples in total; individual
phase populations range from 1,171 to 29,692 samples.

## Unprofiled timings

Cells show the two process medians in milliseconds. These current WSL results must not be compared
as a before/after pair with the older Windows captures. The short run is diagnostic, not a replacement
for published framework charts.

| Workload              |           Mount |     Ten updates |       Hydration |    String SSR |    Stream SSR |
| --------------------- | --------------: | --------------: | --------------: | ------------: | ------------: |
| Plain                 |   3.082 / 3.038 |   6.232 / 5.523 |   2.657 / 2.518 | 0.185 / 0.200 | 0.252 / 0.217 |
| Intrinsic enhancement | 18.746 / 18.581 |   7.379 / 8.391 | 14.843 / 15.192 | 0.799 / 1.008 | 0.867 / 1.105 |
| Component enhancement | 14.314 / 14.606 |   1.671 / 1.729 | 15.477 / 15.698 | 0.561 / 0.550 | 0.598 / 0.553 |
| Explicit host         | 10.718 / 10.310 |   6.230 / 7.013 |   9.424 / 9.858 | 0.643 / 0.589 | 0.760 / 0.602 |
| Intl                  |  11.476 / 9.438 | 32.430 / 41.599 |   7.057 / 7.090 | 0.812 / 0.794 | 0.846 / 0.850 |

All workloads completed. Client assertions verified text, host count, contributed titles, and
receiver/host retention. All recorded hydration samples retained 100 receivers with zero replaced
elements. SSR string and stream byte counts matched. These assertions validate the benchmark,
not every enhancement contract.

## Where samples accumulate

| Scope                | Attribution                                                   | Range across two profiles |
| -------------------- | ------------------------------------------------------------- | ------------------------: |
| Component mount      | `resolveEnhancementTarget`, inclusive                         |                0.08–0.11% |
| Component hydration  | `resolveEnhancementTarget`, inclusive                         |                4.23–4.40% |
| Component hydration  | `readEnhancementBinding`, inclusive                           |                3.94–4.13% |
| Component hydration  | `findExplicitTarget`, inclusive                               |                0.40–0.43% |
| Intrinsic hydration  | `collectTargetEnhancements`, inclusive                        |                4.69–4.94% |
| Component mount      | JSDOM, symbol-tree, CSSStyle and selector module self samples |              41.38–42.01% |
| Component mount      | Reactive package self samples                                 |              15.04–15.48% |
| Component hydration  | DOM emulation module self samples                             |              28.05–29.90% |
| Component hydration  | Reactive package self samples                                 |              21.42–22.20% |
| Component updates    | Reactive package self samples                                 |              58.50–58.75% |
| Component string SSR | `createDeferredSerializedSsrHtmlOperation`, inclusive         |                7.08–7.30% |
| Component string SSR | `createCompiledComponentReceipt`, inclusive                   |                6.66–6.95% |
| Component string SSR | `createCompiledTargetReceipt`, inclusive                      |                6.63–6.69% |
| Component string SSR | `composeTargetProps`, inclusive                               |                3.33–3.40% |
| Intl updates         | `structurallyEqual`, inclusive                                |              10.08–12.00% |
| Intl updates         | `localeFallbackChain`, inclusive                              |                8.86–9.95% |
| Intl string SSR      | `localeFallbackChain`, inclusive                              |              27.69–27.85% |

The root-binding percentage includes reactive bookkeeping and descendant lookup, not just scanning.
`findExplicitTarget` is nested inside it. Replacing scanning with compiler metadata cannot be
credited with removing the whole binding percentage. The component mount workload already takes
the closed intrinsic shortcut. SSR target scanning was not sampled in these simple workloads.
No `resolveEnhancementTarget` samples appeared in scalar update phases; absence at this resolution
does not prove that no call occurred.

DOM placement and traversal are prominent. `placeMountedBefore` includes 23.26–24.50% of component
mount samples, mostly descendant DOM work. Component hydration also spends 2.68–2.86% under
`componentMarkerBoundaryByIdentity` and 2.82–3.16% under `captureHydrationDom`. These support native
browser profiling before changing mounting or hydration algorithms: JSDOM's JavaScript tree and
style machinery can dominate in ways a browser's native DOM does not.

Reactive scheduling, graph settlement, dependency tracking, and scope checks dominate scalar
updates. Component receivers use a compiled intrinsic text binding, whereas plain/intrinsic/explicit
controls contain fragment receivers. Their update times are not an isolated measure of enhancement
overhead. The Intl control has separate locale-processing and structural-comparison costs; it is
not evidence that enhancement target lookup causes those costs. `getCanonicalLocales` alone takes
15.95–16.32% of Intl string SSR samples, nested within locale fallback work.

GC accounts for 12.42–14.27% of component mount samples, 12.37–14.72% of its string SSR, and
28.31–28.55% of its stream SSR. Receipt and deferred-operation construction therefore merit
allocation profiling, but this CPU capture does not establish which allocations caused those
collections. Assertions and cleanup outside the selected windows can still influence later GC.

## Follow-up priorities and limits

1. Profile allocation in enhancement SSR receipt construction and deferred child serialization.
   Preserve opaque operation identity, ownership, and target contribution ordering when testing
   any candidate reduction.
2. Confirm DOM placement and hydration hot paths in a native browser. Within hydration, distinguish
   declaration collection, retained binding setup, and actual root scanning before proposing
   compiler metadata.
3. Investigate repeated locale fallback/canonicalization and structural comparison in the Intl
   workload separately from enhancement routing.

These fixtures do not exercise deep forwarding, conditional root changes, multiple namespace
selectors, automatic fragment hosts, or coalesced contributors. They cannot rule out root discovery
as a hotspot in those cases. The plain control shares the enhancement-enabled bundle, so it is
also not an enhancement-free application cost measurement. There are no layout, paint, allocation
stack, or browser-frame measurements in this capture. No runtime optimization was made.

## Reproduction and retention

```sh
npm run build:native-compiler
npm run build:workspaces
node scripts/profile-enhancement-comparison.mjs
```

The maintained harness documents its controls in the
[fixture README](../../scripts/performance-fixtures/enhancement-comparison/README.md).
Raw profiles, phase windows, samples, source maps, and built artifacts remain in ignored
`.tmp/enhancement-profile`. Use `--output <directory>` to retain another run. Source maps identify
bundled package modules; the checked-in TypeScript source supplies implementation context.
Only this concise report and reusable harness source belong in Git under the
[retention policy](benchmark-retention.md).

Validation passed the workspace build, current native compiler check, 128 build-script tests,
native DOM/SSR reachability checks, harness ESLint, JSDoc checks, and whitespace checks. The new
dependency-free summary test verifies phase exclusion and recursive inclusive accounting without
loading generated package output. An additional component-hydration worker smoke run passed the
runner's explicit zero-replacement and receiver-count checks after those checks were added.
