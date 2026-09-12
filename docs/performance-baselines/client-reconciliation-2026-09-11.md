# Client dependency and row reconciliation investigation

This September 11, 2026 follow-up investigates eXact only, starting from `dca8dca3`.
It follows the [client allocation work](client-v8-optimization-2026-09-11.md).
React was neither modified nor profiled. These focused results do not replace the public full-suite charts.

## Main finding and retained change

The 1,000-row mutation fixture exposed repeated component-root discovery during sibling reconciliation.
`patchCompilerChildReceipt` published completion for each patched child, and the enclosing sibling
pass published it again. A keyed item's nested single-child pass added another completion. Each
publication could scan the owning component's output through `firstTargetElement`, even when it
contained no explicit Target. Updating every row therefore repeatedly searched the same large tree.

The sibling pass now owns completion. Individual child patches do not publish it separately, and
the keyed item's nested pass explicitly defers completion to its enclosing sibling pass. Independent
child reconciliation still completes normally. Root discovery, Target-dependent work, and enhancement
reconciliation remain synchronous; this does not introduce a scheduler, a delayed lifecycle queue,
or a second rendering path. Nested component mounting retains its own lifecycle publication.

Removing the per-child calls first reduced warmed replacement from 93.54 to 37.59 ms. Deferring the
keyed item's nested completion removed the remaining repeated searches:

| 1,000-row workload        | Before, cold | After, cold | Before, warmed | After, warmed |
| ------------------------- | -----------: | ----------: | -------------: | ------------: |
| Change one row            |      5.25 ms |     5.15 ms |        3.06 ms |       2.58 ms |
| Change ten scattered rows |      6.31 ms |     3.77 ms |        3.57 ms |       2.56 ms |
| Change every row's label  |     97.82 ms |    12.82 ms |       93.83 ms |       8.08 ms |

The last result is approximately **91.4% faster**. It is the existing `replacement` case in
`scripts/performance-fixtures/client-update-scenarios.tsx`: all records receive new labels while
retaining their keys. It is not a comparison between rendering and serving a precomputed document.
Each measurement mounts a fresh population, applies its mutation, renders through eXact, and flushes
reactive work. Mounting and final unmounting are outside the mutation timer.

The three-population CPU diagnostic runs the same four complete mutation suites per population.
Sampled self time in `firstTargetElement` fell from **1,120.31 ms to 13.38 ms**. This is diagnostic
CPU time across all mutation shapes, not the replacement latency in the table. Its removal from the
dominant position supports the proposed mechanism. GC self time was 244.65 versus 270.84 ms; this
capture does not establish reduced GC churn. The retained change primarily eliminates repeated work.

## Other experiments

| Experiment                                                                                     | Evidence                                                                                                | Decision                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Arrays for two through eight dependency subscribers, Sets above eight                          | Approximately 0.3–0.6 KB less sampled allocation per small update, no clear timing improvement          | Rejected: another representation and bounded scans throughout membership handling did not earn their complexity |
| Return the completed DOM claim cursor instead of copying its result fields into another object | Claim bytecode decreased from 273 to 204 bytes; isolated timing/allocation results were inconclusive    | Retained as a small simplification; no independent speedup claimed                                              |
| Cache a parsed template on its first use                                                       | Cold 1,000-node static mount 15.18 to 14.75 ms, dynamic mount 13.50 to 13.14 ms; mutation results mixed | Rejected: modest results did not justify adding a clone and retaining template DOM for one-use programs         |
| Omit nested-list cleanup for rows without nested lists on their first render                   | Inspection showed nested lists can execute later, with cleanup ordering and ownership requirements      | Not implemented: the first render alone cannot establish that the cleanup is unnecessary                        |

The final runtime retains the original dependency subscriber representation and template-cache policy.
No compiler helper signatures, emitted contracts, public APIs, or ABI epochs changed.

## Small production application check

The three-row incident application does not expose the large-list scaling cost. Its final balanced
comparison against the frozen `dca8dca3` bundle was:

| Workload  | Before mean | After mean | Before population median | After population median |
| --------- | ----------: | ---------: | -----------------------: | ----------------------: |
| Filtering |   138.93 µs |  136.55 µs |                138.37 µs |               135.50 µs |
| Selection |   232.80 µs |  226.70 µs |                228.50 µs |               224.50 µs |

Sampled allocation was 37,503 versus 37,370 bytes/filter update and 40,388 versus 39,823 bytes/selection
update. Those small differences should not be presented as a major allocation improvement.

## Method and validation

Chromium 149.0.7827.55, production builds, on the shared Windows workstation. All variants were eXact.
The large fixture used ten fresh browser contexts per variant per scenario, with variant order
alternating. Each context executed a scenario four times: the first is cold, and the remaining three
form that population's warmed result. All populations remain in the evidence. CPU profiling was
separate from timing. No builds or tests ran alongside timed measurements.

The large baseline includes the retained claim-result simplification, isolating reconciliation changes.
It uses the existing compiler-built performance fixture, emitted with the fixture's unminified production
settings. The small application uses minified production bundles, ten rotated timing populations and
six separate profiling populations. Every small population includes 20 warmups, then 400 filtering or
100 selection updates, with DOM-state and surviving-row identity assertions. Its common replay transport
serves a captured complete SSR document. These update timings exclude paint and network navigation.
Heap sampling uses a 1 KiB interval and includes objects collected by both minor and major GC.

The final hidden-map application build was byte-identical to its production JavaScript. The bytecode
capture used the actual browser runtime. Raw code, hashes, timing populations, profiles, rejected variants,
and scripts are preserved in the [evidence archive](client-reconciliation-2026-09-11-evidence.zip).
The [machine-readable summary](client-reconciliation-2026-09-11.json) retains population results.

Validation:

- 276 DOM tests and 241 hydration tests passed, including root lifecycle, Target routing, enhancements,
  retained releases, error cleanup, and the new keyed-root regression test.
- The new test protects label updates, retained row identity after reordering, and the final published
  component root. An earlier fixture's implicit-map identity assertion also failed on the unchanged
  baseline. The final fixture explicitly uses `this.map()` to exercise keyed reconciliation.
- Repository test typechecking, focused lint, formatting, platform boundaries, package contents,
  and all seven live eXact controlled-service browser checks passed.
- The compiled 1,000-row rotation guard passed at 5.25 ms median and 5.43 ms p95 across five processes.

This is an internal completion-ownership correction. Application-facing root lifecycle and rendering
contracts are unchanged, so public usage documentation and package guides do not require new instructions.
Public performance charts still describe the last full benchmark run.

Dependency lookup, operation creation, and list materialization are more visible after the repeated
searches are removed. They remain candidates for a subsequent investigation; this round does not claim
that client optimization opportunities are exhausted.
