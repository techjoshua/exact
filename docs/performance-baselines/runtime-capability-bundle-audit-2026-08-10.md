# Runtime-capability bundle audit — 2026-08-10

## Scope

This record supports
[`compiler-authored-runtime-capabilities.md`](../proposals/compiler-authored-runtime-capabilities.md).
It preserves directional measurements and estimates from the motivating client-bundle audit. It is
not a permanent release budget or a statement of current package ownership.

The audit used Vite production builds with writes disabled and recorded minified, gzip, Brotli,
Rollup module reachability, controlled feature fixtures, and counterfactual application builds.
Package-attributed chunks cannot be summed exactly because chunk wrappers and compression context
change their representation.

## Measurements

| Scenario                                |  Minified |     Gzip | Observation                                                        |
| --------------------------------------- | --------: | -------: | ------------------------------------------------------------------ |
| Workbench, React compatibility disabled | 210,476 B | 61,381 B | Complete application chunk                                         |
| Workbench attributed core closure       |  96,152 B | 29,375 B | Core plus reachable reactive/instrumentation modules               |
| Workbench attributed DOM renderer       |  54,645 B | 17,345 B | Included optional renderer paths despite no framework enhancements |
| Synthetic basic DOM closure             | 128,703 B | 39,393 B | Core, reactive, and DOM only                                       |
| Synthetic task API                      |  38,679 B | 12,233 B | Demonstrates task reachability cost                                |
| Synthetic Intl environment              |  61,396 B | 18,591 B | Includes shared dependencies                                       |
| Sudoku Motion chunk                     |  11,851 B |  4,314 B | Optional capability, excluded from core accounting                 |
| Sudoku Gestures chunk                   |  12,049 B |  4,290 B | Optional capability, excluded from core accounting                 |

React compatibility was retained in native Workbench and Sudoku builds because an installed React
package enabled automatic compatibility. Explicitly disabling compatibility removed 26,601 B
minified and about 7,900 B gzip from each application. This is optional-capability leakage, not a
reduction to the intrinsic core implementation.

## Directional opportunities

These estimates overlap and must not be summed:

- task-free component output: approximately 4–6 KiB gzip from applicable complete bundles;
- local client output without continuation/resumption: approximately 2–3 KiB gzip;
- compiler-prepared local contracts: approximately 2 KiB gzip;
- inspection-free production output: approximately 1–2 KiB gzip;
- optional component Intl integration: approximately 1 KiB gzip; and
- removal of enhancement orchestration from a non-enhanced DOM bundle: approximately 3.5–5 KiB
  gzip.

Implementation acceptance requires controlled complete-build counterfactuals plus parse,
evaluation, mount, hydration, interaction, SSR, build-latency, allocation, and retained-heap
counter-metrics appropriate to the changed capability.
