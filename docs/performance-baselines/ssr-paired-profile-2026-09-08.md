# Paired eXact and React SSR profiles, September 8, 2026

Status: paired CPU profiling and targeted experiments completed. A fixed-layout private request-domain capability record is retained. It reduces full renderer time by 2.6–3.6% on Node in two isolated captures; its HTTP effect is inconclusive. Header-order and string-assembly candidates are rejected. Public performance charts are unchanged.

## Comparable measurements

Both frameworks use their existing production Node HTTP paths, with preloaded controlled-service data. Two independent drivers offer 6,000 total requests per second for ten seconds. Each worker first receives five seconds of unprofiled warmup. Inspector CPU sampling starts after warmup at a requested 1,000-microsecond interval and stops after the admitted requests finish. Two fresh process populations reverse framework order. Worker startup and shutdown are outside the profile window.

Node 26.8.1 ran on the same Windows workstation used for the preceding investigations. Background load was not controlled. Of 240,000 scheduled requests, 239,906 completed successfully. The drivers missed 94 scheduled admissions; these are retained rather than counted as successful work. There were zero request errors, including warmups. Artifact hashes and response identities were checked. These fixed-demand, instrumented runs are profiles, not capacity-publication captures.

The existing `renderMs` phase timers are not equivalent across these paths: eXact's produced-response timer includes response writing, while React's ends before document assembly and response writing. This analysis uses call stacks and whole-process counters instead of subtracting those phase timers.

| Framework | Valid profiled requests | Process CPU microseconds per valid request |
| --------- | ----------------------: | -----------------------------------------: |
| eXact     |                  119968 |                                     132.19 |
| React     |                  119938 |                                     113.08 |

Process CPU includes benchmark instrumentation, profiler overhead, and background runtime threads. It is not request latency or an estimate of unprofiled maximum RPS.

## Where sampled time appears

The following mutually exclusive groups classify sampled stacks and normalize accumulated sample intervals by valid requests. They are approximate sampled stack-residence microseconds per request, not independently timed phases. Sampling intervals can include scheduling delays and native waits; main-thread samples cannot explain all process CPU. The evidence retains raw profiles, classification rules, self-time rankings, and inclusive rankings. Inclusive rankings overlap and must not be added together.

| Sampled work                                              | eXact |          React |
| --------------------------------------------------------- | ----: | -------------: |
| HTML rendering, components, escaping, and byte accounting | 30.99 |          36.79 |
| Hydration/state publication                               | 10.29 |           2.46 |
| eXact response-body ownership and adapter                 |  3.37 | Not applicable |
| HTTP output and socket work                               | 34.02 |          30.57 |
| HTTP input and dispatch                                   | 12.26 |          10.50 |
| Benchmark telemetry                                       |  7.68 |           7.82 |
| Garbage collection                                        |  1.12 |           1.13 |

React's state-publication group includes the benchmark document envelope and initial-data script. eXact's group includes positional validation, projection, hydration metadata, JSON serialization, and script publication. React still performs response handling, attributed to HTTP and harness groups; the missing eXact-specific wrapper row does not mean its transport is free. Idle, profile control, and remaining runtime/harness samples are retained in the summary but omitted from this table.

The [subsequent source and stack review](ssr-option-review-2026-09-08.md) narrows the HTTP interpretation:
input/dispatch includes shared benchmark URL parsing and some response lifecycle work because the
classifier matches ancestor modules. It does not measure an eXact-specific input handler. Both
participants share the host and request-entry code; eXact's general request handler is not exercised.
The output category likewise groups broad socket/stream stacks rather than timing a clean phase.

Within eXact's hydration group, validation/projection accounts for about 4.07 sampled microseconds per request, JSON serialization/escaping 4.71, and other publication work 1.51. `createExactProducedResponse` is a distinct response-construction hotspot. The profiles also identify `createFrameworkComponentDomain`, which assembles framework-owned capabilities for the request.

The native output stacks differ: the ordinary eXact path prominently samples `writeUtf8String`, while React prominently samples `writev`. Function names alone do not establish that switching write APIs is an optimization. The experiments below test that hypothesis and reject it for eXact.

## Independent renderer check

A separate production-mode test constructs complete documents without HTTP, request telemetry, or response-ownership wrappers. eXact uses its synchronous renderer plus the static document envelope. React uses its renderer plus the required initial-data script and envelope. Output identities match the profiled HTTP responses for each framework.

After 10,000 warmup renders per framework, 24 alternating rounds of 5,000 renders measured:

| Framework | Complete-document mean microseconds |
| --------- | ----------------------------------: |
| eXact     |                               13.50 |
| React     |                               16.93 |

eXact is about 20% faster in this isolated loop. This does not prove that rendering has the same cost inside an instrumented HTTP request: execution context, allocation history, scheduling, and instrumentation differ. It does argue against replacing the tree traversal merely because total HTTP RPS is lower.

The output byte breakdown also differs:

| Response content                       | eXact bytes | React bytes |
| -------------------------------------- | ----------: | ----------: |
| Complete document                      |        3611 |        3384 |
| Semantic markup                        |        2392 |        2383 |
| Framework marker comments              |         286 |          56 |
| Framework identity attributes          |         160 |           0 |
| Client-state script, including wrapper |         559 |         731 |

eXact publishes a smaller client-state script but more hydration markers and identity attributes. Those bytes serve its hydration model; they are not automatically removable overhead.

## Targeted experiments

### JSON representation

The actual validated hydration graph was captured before serialization. Repeated native JSON stringification took 0.602 microseconds for that graph, 0.567 for a JSON-parsed copy, and 0.571 for a recursively packed-array copy. React's reused initial-data object took 0.510. Each result averages twelve alternating rounds of 100,000 serializations after warmup.

These measurements exclude copying, validation, HTML escaping, and transport. The roughly 5% serialization difference is too small to justify copying the graph, and it does not explain the entire HTTP serialization sample difference. It is further evidence against an unchecked or copied-payload shortcut.

### Request-domain construction, retained

`createFrameworkComponentDomain` previously created temporary objects for seven conditional spread operands before freezing its private capability record. The runtime now creates one fixed-layout record, with absent capabilities represented by undefined values. Accessor selection and option-read ordering are retained. The public domain still exposes only its frozen execution identity. Shared logging state and an explicit zero wall-clock sample retain their behavior.

| Full-render capture  | Before, microseconds | Fixed record, microseconds |
| -------------------- | -------------------: | -------------------------: |
| Node, first process  |                13.95 |                      13.45 |
| Node, second process |                13.89 |                      13.53 |
| Bun, first process   |                14.14 |                      14.22 |
| Bun, second process  |                15.22 |                      15.00 |

Node improves by 3.6% and 2.6%; Bun's modest difference changes direction. Each capture verifies fixture output identity, warms each variant for 3,000 renders, and alternates twelve rounds of 10,000 renders.

The source implementation was then built and compared with the archived pre-change artifact over HTTP. Valid RPS was 11,197 before and 11,130 after, with React at 11,775 in that capture. The eXact ranking reverses between populations: 10,818/10,865 before/after in the first, 11,575/11,394 in the second. This is not evidence of an HTTP improvement. The smaller and simpler construction is retained for the repeatable Node renderer gain.

ABI classification: compatible internal representation change. No emitted helper signature, serialized artifact representation, public domain identity, or provider ABI epoch changes. Old capability records remain readable. Frozen release fixtures were not regenerated.

### Explicit versus implicit headers, rejected

An eXact prototype calls `writeHead` after production succeeds and before `end`, retaining pre-commit error behavior. A diagnostic React variant makes the inverse switch to `setHeader` followed by `end`. The default responses consequently use chunked transfer for explicit headers and Content-Length for the implicit complete-body path; application HTML bytes remain unchanged.

| Variant                          | Valid RPS | Population 1 / 2 |
| -------------------------------- | --------: | ---------------: |
| eXact, ordinary implicit headers |     11044 |    10938 / 11150 |
| eXact, explicit headers          |     10734 |    10826 / 10642 |
| React, ordinary explicit headers |     12286 |    11421 / 13151 |
| React, implicit headers          |     12918 |    12944 / 12891 |

Explicit headers slow eXact in both populations. React's direction reverses between populations. Neither production path is changed, and the diagnostic React variant is not substituted into published comparisons.

### Collect spans and join once, rejected

The profiles motivated testing whether string shape contributed to native UTF-8 writing. The prototype replaces incremental concatenation in the synchronous response collector with an array of spans and a final join. Header policy, encoding, producer completion, and cancellation are unchanged.

Against the rebuilt domain optimization, the ordinary collector measured 11,241 valid RPS and the joined collector 11,088. The joined collector trails in both populations. React measured 10,643 in this separate capture. Absolute rates and framework rankings vary across captures, so the header and assembly tables should not be combined into a single ranking.

All unprofiled HTTP experiments use two drivers at total concurrency 32, five seconds of warmup, ten seconds of measurement, and two fresh populations with reversed order. Their RPS summaries use the union of driver measurement spans. All stages have zero request errors and pass response-identity, artifact-stability, telemetry, and admission/completion checks.

## Concrete next targets

1. The request-domain allocation reduction is implemented and validated. Its measured benefit is renderer time, not proven HTTP capacity.
2. Investigate response-facade construction independently. `createExactProducedResponse` allocates ownership state and installs three property descriptors per response. Any cheaper construction must preserve own enumerable lazy views, single consumption, pre-commit failures, and retained-scope cleanup. The profile identifies a target, not a proven replacement.
3. Treat the hydration group's validation and serialization costs separately. The current evidence does not support removing validation, repacking the finished graph, or assuming that all sampled JSON time is caused by sparse arrays.

The profile does not establish an exact causal decomposition of the throughput gap. Header order, earlier Buffer encoding, and final string joining have now been measured directly and should not be proposed again as demonstrated wins for this workload.

## Validation and evidence

The retained change passes 245 core tests, 235 SSR tests, and all 35 shared browser contracts, including SSR before JavaScript, hydration, optimistic updates, focused-input preservation, and reconnect behavior. Core and comparison builds, frozen release ABI and compiled ABI checks, platform boundaries, package contents, source architecture, JSDoc, and focused lint checks pass. No public setup or application-authoring behavior changes, so package guides and public performance charts are unchanged.

The [summary](ssr-paired-profile-2026-09-08.json) contains normalized profiles, renderer measurements, response sizes, and HTTP results. The [evidence archive](ssr-paired-profile-2026-09-08-evidence.zip) includes raw CPU profiles, captures, scripts, and pre-change artifact snapshots. CPU profiles refer to the original bundle paths; use the archived before snapshots when resolving their source lines. Runtime dependencies remain required. An initial render-only diagnostic without production mode was discarded; the retained script requires production mode, and its documents are checked against the profiled HTTP identities.
