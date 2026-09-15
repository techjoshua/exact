# Shared SSR execution, September 9, 2026

String and streaming entry points now share traversal, component execution, and hydration capture.
Public string APIs return promises. Core task frames own task execution and expose readiness;
rendering waits for pending required work instead of repeatedly awaiting completed task generations.
The unreleased API has no separate synchronous renderer or `Async` compatibility aliases.

The migration improves isolated streaming render time but regresses isolated string render time.
It does not establish performance parity with React. These focused measurements supplement the
[full baseline](post-shell-2026-09-09.md); they do not replace its browser, heap, or capacity charts.

## Renderer measurements

Three counterbalanced pairs per runtime and mode, each in a fresh process with 2,000 warmups and
8,000 measured renders. `NODE_ENV=production`. Both string wrappers are awaited, including the
frozen synchronous implementation. Streaming consumes the complete response. The Bun renderer
probe intentionally imports the same neutral server bundle as Node; native Bun HTTP is measured
separately below. Values are median microseconds per complete document, lower is better.

| Runtime     | Mode   | Frozen eXact | Shared eXact |
| ----------- | ------ | -----------: | -----------: |
| Node 26.8.1 | String |        52.86 |        66.33 |
| Node 26.8.1 | Stream |       111.24 |        94.96 |
| Bun 1.4.2   | String |        36.17 |        48.49 |
| Bun 1.4.2   | Stream |        97.34 |        72.66 |

Individual paired string time ratios were 1.11–1.31 on Node and 1.33–1.39 on Bun. Paired stream
ratios were 0.73–0.86 and 0.69–0.75 respectively. Node samples varied appreciably with local load.
Both eXact builds return 3,966-byte documents without client assets. Their only output differences
are request-local marker ordinals; normalizing those ordinals makes the documents identical.
Production browser checks verify adoption rather than relying on normalized text alone.

## HTTP comparison with React

Two counterbalanced populations per runtime and mode. Each population uses a fresh worker and two
independently owned load-driver processes, each at concurrency 16. There are two seconds of warmup
and four measured seconds. The controlled incident data is preloaded to isolate rendering and HTTP
delivery. Every response must match its participant's complete document identity. All 16 measured
populations completed with zero errors. Values below are mean validated responses per second.

| Runtime | Mode   | Shared eXact | React 19.2.0 |
| ------- | ------ | -----------: | -----------: |
| Node    | String |        6,761 |        9,884 |
| Node    | Stream |        5,903 |        3,910 |
| Bun     | String |        8,231 |       11,044 |
| Bun     | Stream |        6,797 |        8,429 |

Both frameworks construct their complete application shell. String and stream results remain
separate. Node uses HTTP response transport; Bun uses native Fetch response transport. The Bun
adapter awaits the promised string result, and its render telemetry includes that completion.
This is a short local throughput comparison, not an offered-load capacity or saturation study.

## Browser measurements

120 measured production streaming navigations: 20 samples for each of frozen eXact, shared eXact,
and React under local and constrained profiles. Each sample uses a fresh browser context, disabled
cache, and rotating participant order. The constrained profile applies 4× CPU slowdown, 40 ms CDP
latency, and 10 Mbps transfer limits. eXact variants use identical client assets. Every navigation
renders its response at request time and checks semantic readiness and interactions.

| Profile     | Metric, milliseconds   | Frozen eXact | Shared eXact |  React |
| ----------- | ---------------------- | -----------: | -----------: | -----: |
| Local       | First contentful paint |        45.20 |        45.40 |  50.20 |
| Local       | Semantic readiness     |        55.42 |        55.20 |  57.47 |
| Local       | Navigation completion  |        31.11 |        30.75 |  41.08 |
| Constrained | First contentful paint |       259.00 |       258.60 | 261.60 |
| Constrained | Semantic readiness     |       499.19 |       495.49 | 500.33 |
| Constrained | Navigation completion  |       320.45 |       315.89 | 365.43 |

Approximate paired 95% intervals for every shared-minus-frozen difference above include zero.
This sample does not establish a browser timing improvement or regression. Head publication still
waits for tree rendering; this migration does not implement a head flush during traversal.

## Experiments and decisions

The initial hypothesis was that avoiding unconditional async boundaries could reduce streaming
render time by 5–15%, while a single public promise should cost substantially less than awaiting
every internal operation. Experiments retained their raw samples and rejected source variants.

| Experiment                                       | Hypothesis                                                               | Observed result and decision                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Generator traversal                              | One resumable walk would simplify both modes with modest allocation cost | Roughly doubled Node time and slowed Bun about 43%; rejected despite passing tests                           |
| Value-or-promise traversal                       | Eliminate completed-work promise hops                                    | Improved streaming; retained as the shared engine                                                            |
| Direct indexed capture and stateless frame reuse | Recover old string-path allocation savings                               | Small or inconclusive isolated gain; retained the shared capture and applicable frame reuse                  |
| Merge adjacent program spans                     | Reduce deferred segment count                                            | No clear isolated gain; retained fewer segments                                                              |
| Escaping guards                                  | Avoid replacements for strings with no escapable characters              | Modest Node string improvement; retained for both modes                                                      |
| Outer completion and cleanup continuations       | Allocate callbacks only for pending/error paths                          | Small or inconclusive isolated gain; retained simpler completed-work handling                                |
| One sibling-group continuation object            | Remove per-child callback allocation, targeting 5–10%                    | Bun string time fell from roughly 55–57 to 50–51 microseconds; retained                                      |
| Intrinsic host cleanup rewrite                   | Reduce ordinary host cleanup allocation                                  | No Bun gain and worse Node samples; rejected                                                                 |
| Accumulate program output as a string            | Remove the second output array and join pass                             | Bun streaming fell from roughly 73–75 to 70 microseconds in the focused samples; retained                    |
| Lazy task scheduler and readiness checks         | Avoid task machinery in task-free renders                                | Retained for ownership and allocation simplicity; final combined measurements above, no isolated speed claim |

The old string renderer directly executed generated writers. The shared renderer still collects
ordered program segments before consuming them. Profiles show additional continuation dispatch,
escaping, and allocation. Recovering the direct writer's benefits without compromising suspension,
ordered context mutation, or cleanup remains an unresolved optimization opportunity. These results
do not mean that reasonable performance experiments are exhausted.

## Validation and evidence

The clean workspace build, test and docs type checks, source architecture, JSDoc, preserved compiled
artifact fixtures, release ABI check, and platform boundaries passed. Task readiness, SSR, hydration,
and composition coverage passed: 10, 258, 240, and 59 tests respectively. The production browser
suite passed 56 checks across both frameworks, runtimes, and rendering modes. Build-script and
framework-comparison unit tests also passed.

Tests cover pending and completed task readiness, retained task failures, ordered sibling issuance,
cleanup, cancellation, hydration, and string/stream output parity. A captured shared-context writer
must publish its completed continuation identity together with its value, so hydration does not
repeat a task whose value became available before its task settled.

The [machine-readable capture](unified-ssr-2026-09-09.json) contains raw renderer, HTTP, and browser
samples and summaries. The [evidence archive](unified-ssr-2026-09-09-evidence.zip) includes frozen
and candidate artifacts, sources, probe scripts, profiles, experiment samples, and validation logs.
