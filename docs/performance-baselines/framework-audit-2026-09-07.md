# Framework audit: latency, interaction work, and retained heap

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Status: investigation and quieter confirmation complete; server diagnostics refreshed. No production runtime or compiler change retained. The minifier remains a viable candidate, not an accepted default.

## Scope and ownership

This audit follows up on sequential SSR tails, finite-burst tails, browser heap composition,
authoritative settlement, and optimistic feedback. The public browser charts had been refreshed,
but the server latency, memory, and payload charts still used an older capture. Those server
charts are now refreshed for all five frameworks. Independent-driver capacity evidence stays
separate; the obsolete short-window RPS method is not promoted back into the public page.

This is framework and harness investigation, not an application rewrite. Native eXact keeps its
durable state, fine-grained updates, compiler-generated contracts, automatic interaction ownership,
rollback protection, and lifecycle cleanup. No runtime or compiler optimization has been retained
from this audit.

## Server latency and burst completion

Three populations used current production builds and balanced interleaving across all five
frameworks. The first measured 500 sequential requests and 500 bursts per framework; the complete
standard-method capture repeated those populations and captured current memory and payload
diagnostics. An additional experiment used ten seconds of sustained warmup per framework before
1,000 sequential requests and 1,000 bursts. That alternate warmup population is not pooled into
the standard-method public data.

| Population                       | eXact sequential mean / P99 | React sequential mean / P99 | eXact burst mean / P99 | React burst mean / P99 |
| -------------------------------- | --------------------------: | --------------------------: | ---------------------: | ---------------------: |
| First focused run                |              1.24 / 2.33 ms |              1.19 / 2.15 ms |        6.24 / 11.08 ms |        6.70 / 12.13 ms |
| Complete standard-method capture |              1.33 / 2.75 ms |              1.30 / 2.27 ms |       10.02 / 16.02 ms |        8.48 / 13.34 ms |
| Extended warmup experiment       |              1.28 / 2.63 ms |              1.26 / 2.35 ms |        7.56 / 13.17 ms |        7.95 / 12.89 ms |

The modest sequential gap to React repeats. The older chart's exceptionally bad relative burst
tail does not: current eXact burst P99 is below SvelteKit, Nuxt, and TanStack Start in all three
populations. eXact and React exchange the burst mean lead. Longer warmup alone cannot be credited
with improving the numbers because host conditions and process populations also changed.

The user confirmed active use of this PC during the investigation. All observed samples are
retained. Interleaving spreads gradual drift but does not make an interruption affect every
framework equally. These populations do not establish a specific GC, scheduler, or transport bug.
Aggregate GC telemetry cannot correlate an individual slow request with a collection. The next
server experiment should record timestamped upstream-fetch, renderer, output, GC, and event-loop
phases in a separate diagnostic run before changing the renderer or introducing pooling.

The complete capture publishes 500 sequential observations, 500 finite bursts, and five retained
heap checkpoints per framework. Counts and dates are explicit. These are not sustained-capacity
RPS measurements, and retention checkpoints alone do not establish a leak.

## Authoritative settlement and optimistic feedback

The existing replay capture already records dispatch, SSE arrival, HTTP JSON decoding, and visible
DOM changes. Mean phase timings in milliseconds:

| Framework      | Optimistic DOM | Request dispatch | Authoritative DOM | First authoritative arrival to DOM |
| -------------- | -------------: | ---------------: | ----------------: | ---------------------------------: |
| eXact          |          1.568 |            0.620 |            13.846 |                              0.380 |
| React          |          1.464 |            0.200 |            13.652 |                              1.032 |
| SvelteKit      |          1.396 |            0.410 |            13.538 |                              0.448 |
| Nuxt           |          1.102 |            0.282 |            13.980 |                              0.578 |
| TanStack Start |          1.576 |            0.184 |            13.716 |                              1.116 |

The last column subtracts the earlier of the captured SSE notification and claim-response JSON
decoding from the authoritative DOM marker, per sample. It is an observed phase interval, not an
isolated renderer microbenchmark. In this capture eXact has the smallest mean in that interval.
Total settlement is therefore not evidence that eXact's authoritative DOM application is slower.

eXact has more work before request dispatch. Source review and the existing sampled interaction
profile identify ordinary reactive property reads, the authored rollback snapshot, mutation
journaling, atomic trigger publication, and dependency cleanup as investigation targets. A sampled
site in the complete interaction does not establish that it ran before dispatch. More precise
phase instrumentation is needed to assign those costs. Do not remove rollback/version fencing,
reorder the optimistic update behind the request, or bypass the supported state model to improve
the fixture's score.

One concrete structural opportunity is stable dependency retention. `runTracked()` currently
removes all subscriptions before collecting them again, including unchanged dependencies.
Investigate retaining unchanged edges and releasing only removed edges. This is a hypothesis,
not an accepted implementation: dynamic branches, nested tracking, observer-count transitions,
reentrancy, thrown computations, pause/resume, and disposal all need contract coverage. Avoid
adding per-dependency bookkeeping that costs more than the churn it replaces.

## Browser heap

The published snapshot composition attributes approximately 162 KB of the roughly 201 KB eXact
versus React gap to V8 code/metadata. Shapes add about 14 KB and objects/arrays/closures about
39 KB, partly offset by smaller string and native-node totals. Code metadata explains most of the
gap, but ordinary runtime objects are also a measurable target. Removing only code nodes does
not put this current capture below React.

These are disjoint snapshot self-byte categories, not a decomposition of `JSHeapUsedSize` or total
browser-process memory. The measurements do not identify every node's owner. They do establish
that reducing source length alone and normalizing shapes alone are unlikely to close the gap.

Two actual candidates were tested against unchanged eXact using captured pages over HTTP:

| Candidate                                                          | Initial observation                                                                                                                     | Status                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Allocate the scheduler profiling map only when a profile sink runs | No convincing startup or interaction gain; retained JS heap essentially unchanged                                                       | Not retained                                                              |
| Re-minify the emitted client with Terser, two compression passes   | About 3 KB fewer shipped bytes and 34 KB less retained JS heap; mixed unthrottled timing and slower interaction in the shared-PC 6× run | Memory benefit confirmed; timing tradeoff unresolved; keep as a candidate |

The initial comparison used 90 rounds per variant and separate snapshots. The shared-PC
confirmation used 60 rounds per variant at 6× Chromium CPU throttling. Neither candidate was
applied to framework source or the production build configuration. The user then closed their
browser for two new populations at each of 1× and 6×, with reversed starting order. Timing runs
do not overlap builds, tests, or intrusive profiling; heap snapshots run afterward.

## Quieter minifier confirmation

After the user confirmed their browser was closed, two fresh populations ran at each CPU rate,
with reversed initial order. Each population used 60 rounds per variant: 120 observations per
variant at 1? and another 120 at 6?. Nine separate heap snapshots per variant followed each
population. This means browser-closed conditions, not a claim that every host process was idle.

| Metric           | 1? baseline ? candidate | 6? baseline ? candidate |
| ---------------- | ----------------------: | ----------------------: |
| Navigation mean  |      30.871 ? 30.612 ms |    249.547 ? 248.923 ms |
| Optimistic mean  |        2.015 ? 2.048 ms |      19.764 ? 20.747 ms |
| Settlement mean  |      13.220 ? 13.261 ms |      33.884 ? 35.027 ms |
| Retained JS heap |        2.483 ? 2.448 MB |        2.473 ? 2.439 MB |

The memory decrease is about 34.3 KB (1.4%) and repeats in both populations at both CPU rates.
For timing, paired contiguous five-round block bootstrap intervals preserve local ordering and
stratify by fresh population; 10,000 resamples use the recorded deterministic seed. The 95%
intervals for candidate minus baseline include zero for every timing metric. At 6?, optimistic
feedback is +0.983 ms with interval ?0.473 to +2.403 ms; settlement is +1.142 ms with interval
?0.640 to +2.834 ms. Both populations have positive interaction mean differences, but that does
not establish a reliable regression. Nor does an interval containing zero establish equivalence.

Decision: withdraw the earlier provisional rejection. Keep this minifier candidate and its
reproduction evidence available. The memory benefit is established in this fixture; a timing
penalty is not established, and neither is performance equivalence. Do not change the framework's
production default yet. A promotion decision needs additional representative applications and
an explicit acceptable interaction/startup regression bound, along with a correctness run on
an actual integrated build. This postprocessing experiment does not establish the build-time
cost or behavior of a production bundler integration.

Quieter raw populations, paired analysis, and runner sources (local capture: `framework-audit-2026-09-07-quiet.json`)
retain the evidence independently of the earlier shared-PC runs.

## Framework-wide priorities

The [reactive subscription follow-up](reactivity-hypotheses-2026-09-07.md) tests the dependency and
journal hypotheses below. It retains subscription reconciliation, investigates its V8 metadata cost,
and records the scope-disposal retention defect and the rejected allocation mitigation.

1. Preserve fast authoritative DOM application and the good optimistic tail. Reduce work before
   dispatch through shared runtime/compiler improvements, not application-specific shortcuts.
2. Measure unchanged-dependency churn and optimistic-journal allocation by phase. These may improve
   both interaction CPU and allocation, unlike merely changing scheduling delays.
3. Target executed/retained code and unused capability reachability alongside retained object count.
   A smaller generated representation must also pass startup and interaction checks on throttled CPU.
4. Investigate sequential server tails with timestamped phase evidence. Avoid assuming the old
   burst ranking establishes a runtime defect, or repeating already-rejected transport experiments.
5. Admit improvements only with behavior checks and paired performance evidence. State-machine
   inspection, rollback, ownership, hydration validation, fine-grained work, and existing throughput
   leads remain requirements rather than optional performance costs to remove.

## Evidence and reproducibility

- Complete server diagnostic capture (local capture: `framework-audit-2026-09-07-ssr.json`)
- Experiments, phase analysis, and runner sources (local capture: `framework-audit-2026-09-07-experiments.json`)
- [Prior client replay baseline](client-http-replay-2026-09-07.md)

The experiment archive retains sequential raw samples and finite-burst durations. Per-request
burst records and duplicated worker arrays from the alternate warmup populations remain in scratch
captures; they are omitted from that compact archive. The complete standard-method SSR capture
is retained in full. Candidate SHA-256 values and exact transformation/runner sources are recorded.

Public server diagnostics can be reproduced without changing capacity or browser charts:

```sh
node scripts/component-local-target-abi/refresh-docs-ssr-report.mjs apps/docs/src/data/performance-report.json docs/performance-baselines/framework-audit-2026-09-07-ssr.json apps/docs/src/data/performance-report.json --diagnostics-only
```

Validation: the diagnostic publisher's three focused tests pass, including preservation of
independent capacity/browser data and rejection of incomplete latency populations. Targeted ESLint,
Prettier, docs TypeScript checking, and the standalone docs build pass. Desktop and mobile checks
verify all eight distribution tables and five heap rows against published JSON, with no page errors
or horizontal overflow. All task-owned benchmark, framework, and verification listeners are closed.
