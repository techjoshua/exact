# Reactive subscription and allocation experiments — September 7, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

## Decision

Keep subscription reconciliation in `packages/reactive/src/internal/dependency-graph.ts`.
Dynamic watchers retain unchanged memberships rather than removing and rebuilding them on every
execution. Old memberships cannot schedule the executing watcher until it rereads them; obsolete
memberships are removed on exit. Compiler ABI and application APIs are unchanged.

The user accepts the approximately 5–6 KB retained-JavaScript-heap increase in exchange for the
watcher CPU improvement. This is a deliberate tradeoff, not an allocation-free optimization or a
proven improvement to the small comparison application's interaction latency. The earlier minifier
experiment remains separate and has not been incorporated into the production bundler.

## Experiments and outcomes

| Experiment                                                               | Focused result                                                                                                                                      | Application evidence                                                                                              | Decision                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Retain unchanged watcher subscriptions                                   | Corrected implementation reduced stable/branching watcher time by 15.9%/18.6% in one paired run and 14.1%/13.6% in the subsequent three-variant run | Two fresh populations at both 1x and 6x CPU: no established timing change; about 5–6 KB more retained JS heap     | Keep with branch and disposal regression coverage                  |
| Reuse the proxy's existing property descriptor when constructing an undo | Write-only rollback batches: 40.093 to 33.504 ms, 16.4% lower; retained optimistic journals: 66.019 to 64.376 ms, 2.5% lower                        | Initial 80-round browser screen showed mixed small differences; watcher-inclusive batch microbenchmark was slower | Preserve candidate and evidence; do not integrate on this evidence |
| Read the previous mutation version only when retaining version ranges    | Direct writes: 31.795 to 29.870 ms; ordinary rollback batches: 40.093 to 37.074 ms                                                                  | Publish-only and retained-journal write workloads were slightly slower; browser screen showed no convincing gain  | Restore baseline implementation                                    |
| Avoid reconciliation allocations on initial dependency collection        | Stable watchers: 96.806 ms versus 87.398 ms for the kept version in the same run; branching: 155.475 versus 151.701 ms                              | No browser promotion run after the weaker steady-state screen                                                     | Revert this mitigation; preserve its prototype                     |

These microbenchmarks measure CPU in synthetic workloads, not SSR RPS or application latency.
The original watcher-inclusive batched-write gain did not repeat in the later population; it is
not an acceptance claim. Do not compare baseline means across different runs as an optimization
effect. All variant comparisons are interleaved within their own population.

Microbenchmarks use four discarded rounds, then 20 measured rounds of 2,000 iterations for watcher
workloads. Write-only tests use 30 measured rounds of 20,000 iterations. Two-variant runs alternate
order. Three/four-variant micro screens alternate forward/reverse order, which is not fully
position-balanced for the middle variants; their small differences remain screening evidence.

## Browser confirmation

The user confirmed their browser was closed. No task-owned builds, tests, or profilers ran during
timed samples. This does not establish that the machine had no other background activity.

Each CPU rate has two fresh Chromium populations, 60 paired rounds per variant per population,
and two discarded rounds. Every sample uses a fresh cache-disabled context. Production HTML and
client bytes are served through the common HTTP replay implementation; framework servers are
stopped and the deterministic API/SSE service remains live. Nine separate post-GC snapshots per
variant follow each population. Initial ordering reverses between populations.

| Mean                     | 1x baseline → kept candidate | 6x baseline → kept candidate |
| ------------------------ | ---------------------------: | ---------------------------: |
| Navigation completion    |           31.748 → 31.822 ms |         243.503 → 241.501 ms |
| Optimistic feedback      |             2.018 → 2.022 ms |           19.162 → 19.399 ms |
| Authoritative settlement |           13.035 → 13.102 ms |           32.503 → 32.571 ms |
| Retained JS heap         |  2,481,958 → 2,487,721 bytes |  2,473,038 → 2,478,353 bytes |

Paired contiguous five-round block bootstrap intervals, stratified by population with 10,000
deterministic resamples, include zero for every timing difference. At 1x, the optimistic interval
is −0.094 to +0.103 ms; at 6x it is −0.790 to +1.194 ms. These bounds do not establish equivalence
or rule out every practically relevant regression. Heap differences repeat across populations.

The final integrated client has the same SHA-256 as the tested corrected candidate:
`7a81177d98105ff80f44e5564428604bf0880d1457064d967b64d3a930d274f5`.
The Node SSR fixture does not retain this tracking code. Its baseline and final bundles both hash
to `0be9bdc750799b1eb2cf45057cd60337155f9e597b4a565196fe491ee83c63a7`; no SSR improvement is claimed.

## Where the heap went

Separate snapshots attribute approximately 6,352 bytes (1x) and 6,995 bytes (6x) of additional
self-size to V8 code/metadata nodes. Object shapes increase about 200 bytes, ordinary objects
about 65–71 bytes, and closures 64 bytes. Array self-size decreases about 214 bytes. Native nodes
increase about 1 KB. These snapshot categories include engine-owned data and must not be presented
as a partition of the separate `JSHeapUsedSize` measurements.

The implementation allocates a pass object, a Set and a replacement dependency array per tracked
execution. The stack releases the pass in `finally`; it does not retain old generations. Most of
the measured retained increase is compiled machinery, not a growing collection of pass objects.
Snapshot self-size does not measure total allocation traffic or establish the absence of all leaks.

## Disposal investigation

A separate GC diagnostic deliberately keeps the reactive source alive while installing, updating,
and disposing 4,000 watchers over eight batches. It covers ordinary stop, stop during callback
execution, and a throwing callback. Weak references track payloads captured by each watcher.
A second scenario replaces 2,000 nested source objects while their watcher remains active.

The baseline retains 1,336 payloads: each is from a watcher that stops its own scope, then reads
reactive state before returning. Tracking can reattach that inactive watcher after its stop has
already cleaned up. The corrected and allocation-mitigation candidates both collect all 4,000
payloads. All three variants collect every replaced dependency target.

The retained implementation performs final cleanup when execution leaves an inactive reaction.
Public regression tests inspect an independently owned computed source after scope disposal on
both initial execution and a rerun; it must report no observation. This protects the cleanup
contract without putting nondeterministic GC timing into the package test suite.

The initial subscription prototype also exposed a branch-write defect: writing an old dependency
without rereading it scheduled an extra pass. It was corrected before acceptance and is protected
by a public notification-count test. The discarded prototype's timing evidence is not acceptance
evidence for the final implementation.

## Evidence

- Experiment samples, source variants, and microbenchmarks (local capture: `reactivity-hypotheses-2026-09-07.json`)
- Four browser confirmation populations and paired analysis (local capture: `reactivity-hypotheses-2026-09-07-quiet.json`)
- Fresh five-framework browser measurements (local capture: `reactivity-hypotheses-2026-09-07-browser.json`)
- Fresh five-framework heap composition (local capture: `reactivity-hypotheses-2026-09-07-heap.json`)

The public browser and heap charts are refreshed from the new five-framework captures, rather
than combining eXact's new results with other frameworks' earlier samples. Server evidence keeps
its independent measurement date. Earlier startup-profile archives remain historical evidence.

The refresh contains 50 browser rounds and 10 separate heap snapshots per framework, each with
one discarded round. Resource hashes match between the two captures for every framework, and the
eXact client matches the paired candidate. Means from the published browser capture are:

| Framework      | Navigation ms | Optimistic ms | Settlement ms | Retained JS heap MB |
| -------------- | ------------: | ------------: | ------------: | ------------------: |
| eXact          |        30.886 |         1.862 |        13.590 |               2.488 |
| React          |        39.704 |         2.084 |        12.870 |               2.303 |
| SvelteKit      |        32.450 |         1.644 |        13.286 |               2.078 |
| Nuxt           |        43.056 |         1.250 |        13.844 |               2.334 |
| TanStack Start |        53.716 |         1.926 |        13.694 |               2.763 |

These are descriptive comparison results, not before/after effects. The paired confirmation above
is the evidence for attributing changes to this optimization.

Validation: 161 reactive, 237 core, and 272 DOM tests; 35 shared browser/SSR checks across all five
frameworks; three publication tests; reactive build, targeted lint, platform-boundary checks, and
reactive package-content inspection. Docs type checking and standalone production build pass.
Desktop and mobile checks verify eight distribution tables and five heap rows against their data,
with no page errors or horizontal overflow. All task-owned benchmark and verification listeners
are closed. Changes are local and have not been deployed.
