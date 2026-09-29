# Performance measurement

This guide owns measurement commands, correctness admission, and interpretation. The
[framework comparison](framework-comparison.md), [load guide](ssr-load-testing.md), and
[comparison methodology](../framework-comparison/methodology.md) define their respective workloads.
Follow the [retention policy](performance-baselines/benchmark-retention.md): raw captures and
per-run generated reports belong in ignored local storage.

## Browser comparison priorities

Visible content and working interactions lead the browser comparison. The public page shows
the browser load event, FCP, and pre-click LCP, followed by optimistic feedback and server
settlement. Each chart has a percentile table. The chart library generates the percentile,
heap-composition, and concurrency tables from their chart data, including labels and formatting.
Browser Event Timing and startup layout shifts remain in the benchmark evidence but are not shown as public charts.
The load event measures document loading and does not establish that every interaction works.
Service-connection readiness and resource costs remain in expandable diagnostics. Startup-click
checks remain part of the benchmark evidence rather than a separate public table. The [browser methodology](../framework-comparison/methodology.md#user-visible-browser-measurements)
defines each observation window and its limits. Every framework uses the same collector.

Changing observers or their boundaries changes the measurement protocol. Rerun all five
participants together when refreshing these results. Historical diagnostic navigation times
must not be presented as a framework speedup against an older, differently instrumented capture.

## How eXact reduces work and waiting

Compiler-tracked dependencies target browser updates at affected expressions and DOM regions.
During SSR, task input readiness determines when compiler-described work becomes eligible. The
request-owned scheduler starts ready work synchronously when a permit is free, avoiding an extra
microtask before that task starts I/O. `maxAsyncSsrConcurrency` defaults to 4 and is capped at 32.

Components with compiler-attached execution subgraphs prepare reachable children before draining
all their own setup work. Independent child tasks can therefore overlap while HTML traversal
remains ordered. Structural inputs, inactive branches, actual data dependencies, and compatibility
boundaries still constrain discovery and execution. This does not speculate across unselected
branches or parallelize arbitrary sequential JavaScript. See [SSR and hydration](ssr-hydration.md)
for the full execution contract.

The Node adapter separately coordinates host-level rendering admission. It measures event-loop
delay and completed-response throughput, trials bounded batches of starts with yielding, and
retains or backs off that policy based on observed results. This schedules framework work to leave
opportunities for network I/O. It does not modify Node's event loop or network stack. A batch limit
bounds starts, not synchronous render duration. Client latency remains an external measurement.
When reassessing a previously selected policy, Node and Bun bound uninterrupted immediate starts
before restoring scheduled admission. This lets a responsive alternative complete its trial while
stopping a disruptive probe before it admits more work. The guard cannot interrupt an individual
render. See the [admission policy](ssr-hydration.md) for its observation windows and limits.

Early and parallel data loading also exist elsewhere. Next.js documents
[parallel fetching and preloading](https://nextjs.org/docs/app/getting-started/fetching-data#parallel-data-fetching).
SvelteKit runs [page and layout loaders concurrently](https://svelte.dev/docs/kit/load#Parallel-loading),
and TanStack Router provides [parallel route loading](https://tanstack.com/router/latest/docs/guide/data-loading).
Svelte also runs independent [async markup expressions concurrently](https://svelte.dev/docs/svelte/await-expressions#Concurrency).
These documented approaches do not establish equivalence to eXact's task ownership and scheduling,
but they rule out describing early parallel work as exclusive to eXact. The supported eXact claim
is its integration of component-local tasks, compiler-described dependencies, request-owned
scheduling, and cancellation. This is a comparison of documented mechanisms, not a cross-framework
execution experiment.

The published benchmarks measure complete workloads. They do not isolate how much performance
comes from dependency scheduling, targeted updates, or host admission. Explain these mechanisms
as design choices and evaluate their combined results under the recorded workload and environment.

## Current results and interpretation

The latest SSR refresh measured clean 0.7.0 revision `063d1dac` on September 29, 2026
(UTC). Browser, compiler, and other internal measurements retain their dates and source
identities from the full capture at `3b5a43cc`. Both revisions include the default after-load
SSR bootstrap described in [document composition](child-composition.md).
The [maintained results](performance-baselines/results.json) record source revisions,
dependencies, environment, commands, correctness, and derived values. The public charts use
compact inputs under `apps/docs/src/data`.

All 26 SSR refresh phases passed, including fresh builds, suite tests, and browser correctness
checks for Node and Bun through both rendering APIs. The run used Node 26.9.0, Bun 1.4.2, and
native loopback in one private network namespace. It did not require a fresh reboot or control
other user activity. Sustained captures used two reversed process populations. Each offered
rate owned fresh processes, with 30 seconds of warmup and 60 seconds of measurement.

The preceding full run passed all 39 phases. Its retained browser measurements used 200 balanced
samples per framework. Startup profiling used 10 samples at each of three CPU rates, and heap
composition used five rounds. Those measurements were not repeated for the SSR refresh.

### Browser experience

Compared with the preceding browser capture at `4f57f222`, eXact's mean load-event time fell
from 23.81 to 20.11 ms, and p99 fell from 34.10 to 25.80 ms. SvelteKit's mean changed from
22.35 to 22.50 ms. The load improvement therefore exceeds the shift in that control, but this
is a historical comparison rather than a matched attribution experiment.

Mean first contentful paint was essentially unchanged, from 46.84 to 47.18 ms. Its p95 stayed
at 52 ms and p99 fell from 64 to 60 ms. SvelteKit averaged 48.42 ms with a 60 ms p99.
FCP and the latest pre-click LCP coincided throughout this server-rendered dashboard capture.
Service readiness became later, from 54.50 to 60.53 ms on average. An earlier load event does
not establish earlier paint or readiness.

Native interaction duration remained 16 ms for eXact. Optimistic feedback averaged 1.61 ms and
server settlement 13.02 ms. Warm browser heap remained effectively unchanged at 2.567 MB.
All five frameworks passed all five first-paint click probes. All other clicks admitted after
an observed paint also passed. Pre-paint clicks are excluded consistently across frameworks
and counted separately, including every held-script probe in this capture. A row with no
admitted clicks supplies no evidence of early-interaction safety. These small populations do
not establish behavior for every device or startup timing.

The separate CPU-throttled profile measured eXact script CPU means of 20.70, 82.76, and
124.62 ms at 1×, 4×, and 6× throttling. Those profiled values use different instrumentation
from the ordinary browser collector and should not be substituted for its paint measurements.

### Server capacity and tails

The refreshed preloaded capacity sweep peaked at 18,911 valid RPS for Node buffered responses
and 18,023 for Node streaming, both at concurrency 64. Bun buffered peaked at 13,966 RPS at
concurrency 32, and Bun streaming at 11,508 RPS at concurrency 16. These are aggregates across
both populations. The public charts retain all concurrency levels and their latency distributions.
Peak throughput does not establish performance under a fixed arrival rate or with data fetching.

At 8,000 offered RPS, Bun streaming completed 7,998 RPS with no capacity misses or response errors.
Mean response time was 2.90 ms, with P50 of 1.21–1.33 ms, P75 of 2.57–2.85 ms, P95 of
8.24–15.10 ms, and P99 of 28.59–31.92 ms. The preceding full capture at `3b5a43cc` completed
7,562 RPS with 5.39% capacity misses and 88.26–89.66 ms P99. The improvement repeated in both
populations and supports the earlier matched scheduling comparison.

At 10,000 offered RPS, Node streaming sustained the offered rate with a 1.24 ms mean and
7.32–12.33 ms P99, compared with 11.82–16.86 ms P99 previously. Node buffered also sustained
the rate, with a 1.11 ms mean and 6.82–8.08 ms P99, up from 5.45–6.10 ms. Bun buffered sustained
the rate with a 1.95 ms mean and 18.85–19.54 ms P99, up from 12.92–15.64 ms. These buffered-tail
costs remain visible even though peak throughput was similar or better.

Bun streaming still could not sustain 10,000 offered RPS. It completed 8,492 RPS with 15.00%
capacity misses, a 57.02 ms mean, and 91.33–97.15 ms P99. The preceding capture completed
7,544 RPS with 24.49% capacity misses and 86.85–89.60 ms P99. More demand was served, but the
tail was higher. Unsent arrivals have no response latency, so neither the mean nor percentiles
alone describe overload behavior.

Ordinary fetching also produced mixed results. Node buffered throughput rose from 4,014 to
4,136 RPS, while Node streaming fell from 4,110 to 3,550 RPS. React's corresponding Node
streaming result was nearly unchanged, from 2,483 to 2,479 RPS. This eXact-specific decline
was reproduced in the matched scheduling investigation below. Bun buffered and streaming
ordinary-fetching throughput rose slightly to 4,973 and 4,799 RPS respectively.

The Node ordinary-fetching investigation kept the current application, renderer, dependencies,
and fetch service fixed, changing only the adapter's streaming admission policy. Two reversed
pairs measured 4,260–4,324 RPS with the earlier fully batched policy and 3,689–3,785 RPS with
the current work window, an 11–15% loss. Mean latency increased from 7.38–7.49 to 8.43–8.65 ms.
Worker CPU cost increased from approximately 0.29 to 0.32–0.33 ms per request, while GC time per
request remained similar. Data loading increased from 3.53–3.59 to 4.32–4.47 ms.

This fixture fetches its data before entering SSR. The work window permits some ready renders
to execute directly in fetch-completion callbacks, where the earlier policy queued them together.
A separate trace showed both adaptive gates predominantly selecting scheduling. An ablation
retained the window's clock and reset bookkeeping but queued every enabled streaming checkpoint.
That recovered throughput to 4,115–4,179 RPS, compared with 3,704–3,768 RPS for the current policy
in the same reversed pairs. Lost batching is therefore the main demonstrated cause, rather than
the bookkeeping alone. This experiment does not identify individual networking or V8 CPU costs.

Node now retains fully batched streaming as a candidate in the same adaptive controller,
alongside budgeted streaming. The earlier controller compared budgeted scheduling with immediate
execution and could select it even when full batching would perform better. Comparisons use the
existing observer and completion epochs, with settling windows and controls on both sides.
Interrupted comparisons restore the incumbent, and idle traffic resets the choice.

The selector's focused ordinary-fetching comparison measured 4,177–4,229 RPS against
3,723–3,771 RPS for the budget-only control. Mean response time fell from 8.46–8.57 to
7.54–7.64 ms. A preloaded 10,000-RPS guard sustained demand for both variants. The selector's
P99 was 5.80–9.09 ms, compared with 9.55–9.97 ms for the control. Mean latency ranges overlapped
at 1.12–1.23 and 1.20–1.22 ms respectively. These are reversed, same-host diagnostic pairs,
not a replacement for the full benchmark capture. The candidate was built from uncommitted
source, with source and emitted-artifact identities retained explicitly.

`nodeStreamingFetchComparison` in [results.json](performance-baselines/results.json) retains
source substitutions, artifact identities, distributions, telemetry summaries, and limits.
All compared responses were identical, with no measured errors. Adapter tests, SSR resumption
tests, and Node/Bun/Deno/Cloudflare acceptance passed. Public benchmark charts retain their
existing capture dates. Other benchmark workloads remain outside this focused verification.

eXact recorded no request errors in any sustained capture. React's Node streaming measurements
recorded 458 errors at 8,000 offered RPS and 1,908 at 10,000. Warmup failures and missed arrivals
remain recorded separately. Tables include request-weighted mean response latency and the
minimum and maximum driver/population P50, P75, P95, and P99. Percentile ranges are not pooled
request percentiles. Earlier captures did not retain every one of these summary fields.

The scheduling changes let Bun yield between queued render batches and give Node progressive
rendering a shared half-millisecond work window while adaptive scheduling is active, with the
fully batched candidate described above. The work
window is shared with Bun. Initial request admission, cancellation, output ordering, and response
ownership retain their contracts. The earlier matched evidence in `ssrSchedulingComparison` in
[results.json](performance-baselines/results.json) isolates the streaming improvement and smaller
buffered-tail cost more directly than comparisons between full runs. Adapter tests, native Bun
tests, and Node/Bun/Deno/workerd runtime acceptance passed for those changes.

The cause of the much lower historical tails is not fully established. Earlier-document source
substitutions also failed to reproduce those timings under matched current dependencies and
runtimes. Replacing callback-based hydration-slot replacement with slices reduced render-only
CPU cost without establishing a network-tail improvement. `ssrDocumentComparison` retains those
source identities, failed attempts, measured distributions, and limits. Neither that optimization
nor this refresh explains the entire historical timing gap.

### Choosing a measurement scope

The full run took about 94 minutes, and the SSR-only refresh took about 83 minutes. Fixed
sustained-load windows dominate the cost. Running load generators concurrently on the same
machine would make measurements compete for resources.
For a targeted change, a matched before/after comparison of the affected workload provides
stronger attribution than repeating the full matrix against an older capture. Focused results
retain their own source identity and do not replace unmeasured groups in the published charts.

Earlier matched traversal experiments reduced individual hydration-operation costs without a
repeatable whole-page navigation improvement. Loading-strategy experiments also showed why load
alone is insufficient: immediate dynamic import with preload advanced the load event while paint
and service readiness became later. Header-only preload and moving the normal module script to
the body with head and response-header preloads supplied no benefit in those cold-loopback
comparisons. Their bounded summaries and limitations remain in the maintained results.

The current after-load policy leaves the SSR document available while delaying bootstrap loading.
It does not add JavaScript preload hints. Applications can select normal bootstrap loading when
earlier activation is more important. Neither loading policy guarantees that an arbitrary click
before handlers attach will succeed. Cold local measurements do not establish warm-cache, CDN,
or slower-network performance.

### Additional release checks and theme cost

The standard release performance profile passed its reactive/DOM, framework client/server,
compiler workflow, theme, DevTools, and React compatibility checks. Collection transactions,
Node/Bun server diagnostics, transport/build-host diagnostics, and React adapter measurements
also completed. The full shipping heap and allocation guards passed again at `3b5a43cc`, as did
the unchanged native compiler corpus timing guard. These checks do not establish performance for
every feature combination.

The themed shipping fixture now reuses validated immutable palettes and system-preference CSS
across equivalent scopes. Both caches are bounded. Component state, children, preferences, and
cleanup remain independently owned. On clean revision `62204d10cd2918058d0943b90ebc999a77028037`,
the complete heap guard passed 100 warmup renders and five batches of 200 renders with no retained
components or effect scopes. The complete allocation guard measured 2.38 MB per request after
100 warmups and 200 measured requests, below its unchanged 5.5 MiB ceiling.

A production-bundled shipping probe measured 127 ms for its first render and 3–5 ms for the next
four. Before the repair, the same probe took 622–664 ms on every render. This small in-process
probe separates cold generation from reuse, but does not measure sustained request capacity.
The initial abbreviated allocation diagnostic estimated 1.84 GB per request. It established a
failure, but its shorter sampling protocol does not provide a matched full allocation baseline.
The maintained theme guard now measures fresh system scopes, warmed resolution, and cold resolution
separately. The incident-dashboard charts use static styling. Their current capture includes the repair
but does not measure this theme workload.

The initial compiler corpus capture flagged incremental-edit times for Workbench and the
microfrontend portal. Workbench's warning did not recur in matched reruns. Profiling the portal
identified unnecessary contextual type checking of call arguments whose receiver binding was
already unknown. Revision `205dc57d` identifies possible receivers first, while retaining type
checks for mutable receiver ownership and preserving access-path metadata.

Two reversed populations, each with three cold and three incremental samples, compared the old
and new compiler binaries against the same 385-file, 28-project corpus. The portal's median edit
times fell from 133–141 ms to 72–74 ms. Both new-compiler populations passed the unchanged corpus
timing budget. Generated code, source maps, diagnostics, and analysis metadata matched for all
385 files. This optimization changes compiler work without changing emitted runtime behavior.
The tracked September 1 baseline came from Windows and Node 24, so the same-host comparison
provides stronger evidence than the historical ratio alone. The tracked baseline was not replaced.

The maintained results record source identities, commands, sample counts, limits, and both
comparison orders. Theme verification also covers installed packages through Vite, Bun, and
Webpack, browser preference changes and JavaScript-disabled SSR, plus native Node, Bun, Deno,
and workerd rendering. These repairs clear the theme memory failures and compiler timing warnings
identified by this release run. They do not establish performance for every application workload.

## Earlier response-path investigations

The preceding full capture, `8546ba40bf178d09c5f5157c6927f531cf22b748`, introduced the public
progressive response API with platform-owned consumption. The observations below retain that
capture's comparison with its predecessor and the source identities of later focused diagnostics.
They do not describe a matched comparison with the current revision.

In that capture, Node wrote produced spans directly to its socket; Bun owned a bounded 32 KiB Web
stream. The authored and compiled components remained common to both runtimes and rendering modes.
Its predecessor used an already-created progressive stream, so the transition also changed the
response ownership workload.

In that earlier comparison, Node streaming improves its eXact/React throughput ratio at
every measured concurrency, including 9.7% at concurrency 128. Bun streaming remains lower at most
points: its ratio falls 8.3% at concurrency 128 and approximately 3% under scheduled demand. Keep those
unfavorable results visible. Matched old/new diagnostics found a smaller, roughly 3% direct Bun streaming
gap. Removing the producer completion wrapper recovered part of it, but also removed required error and
cancellation behavior. Byte-counting and empty-encoding probes did not establish a useful improvement;
correctness-preserving completion rewrites did not improve both reversed samples consistently. The
remaining cost is not fully isolated, and this capture does not establish complete Bun recovery.

The Node string concurrency-64 ratio and Bun string 10k-demand p99 also worsened against the previous
capture, but matched old/new diagnostics did not reproduce those regressions. Node's new path averaged
16,490 RPS versus 15,987 for the old path at concurrency 64. Bun's new string path sustained approximately
9,986 RPS with 47 ms p99 versus 9,967 RPS and 50–56 ms for the old path at 10k offered demand. These
two-population diagnostics use copied control artifacts and modified local bundles, not reproducible
clean-checkout variants. Their bounded summaries and limitations accompany the maintained results.

A subsequent Bun 1.4.2 wire probe found that the 3,963-byte preloaded streaming response uses
`Content-Length`, while a response with a delayed tail already sends the available head with HTTP/1.1
chunked framing. Setting `Transfer-Encoding` or deferring all production did not force chunking for
immediately completed output. Yielding after the first output chunk did, but reduced mean throughput
from 10,473 to 5,643 RPS at concurrency 16 and from 7,969 to 5,536 at concurrency 128. A timer-based
yield was also slower. These two reversed populations used 10 seconds of warmup and 15 seconds per
concurrency, native isolated loopback, and matching decoded response hashes with no request errors.
The variants modify ignored adapter bundles based on `1c7b707675ba01ad43a2b2c75c8831b30b5d860a`;
that revision alone does not reconstruct the prototypes. This diagnostic does not replace the full
capture. Forced framing is not an established remedy for the remaining Bun throughput deficit.

A native Bun direct-stream variant that flushed every chunk also regressed in both populations:
approximately 6,172 versus 10,616 RPS at concurrency 16 and 5,898 versus 8,000 at concurrency 128,
with matching content and no request errors. Flushing only the first chunk failed HTTP preflight;
a concurrent request probe observed duplicate terminating chunks. Native HTTP backpressure and
explicit cancellation worked in the direct-stream probe, but its JavaScript-reader path exceeded
the requested buffer bound. These prototypes were not adopted. Their results do not establish that
all native streaming approaches are slower, or fully explain the existing deficit.

The [September findings](findings/2026-09-performance.md) consolidate consequential measurement
limitations and rejected approaches. Earlier reports remain accessible in
[Git history](https://github.com/techjoshua/exact/tree/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines).
They describe their recorded environment, not current performance guarantees.

Linux jobs must verify native loopback routing and record route and namespace metadata. WSL mirrored
networking can route `127.0.0.1` through virtual Ethernet. Use the
[network isolation recipe](../framework-comparison/README.md#local-benchmark-networking) for the
entire benchmark job. The explicit routed-loopback override is for network experiments only.

Compiler-closed SSR bundle acceptance runs in ordinary Vite, Bun, and Webpack tests as well as
the performance fixture builder. These tests execute scheduled server work, check direct component
ownership, and reject retained generic component or client-reactivity machinery. Server fragment
presentation evaluates contributions when their owning render settles; it does not create client
subscriptions solely to serialize a request. Client projection retains its reactive subscriptions.

## Commands

Run the complete framework baseline after building the repository:

Runtime changes require the full repository build, including package client/server target generation,
before rebuilding benchmark applications. A TypeScript-only incremental core build does not refresh
those target copies. For focused core preparation, `node scripts/compile-exact-package.mjs packages/core`
performs that generation; rebuild the affected benchmark applications afterward.

```sh
npm run benchmark:framework
```

The release performance profile builds the repository first and then runs the framework, reactive,
compiler, DevTools, and React-compatibility benchmarks after the complete correctness admission
sequence:

```sh
npm run performance:check
```

The npm prerequisite runs `release:check`, the isolated Router v6.3 check, Theme Lab browser
acceptance, and the native compiler corpus first. Correctness and structural failures stop before
measurement. A machine-local native compiler timing excess is recorded as non-publishable timing
evidence and warns without discarding the admitted build. Once those checks exit, the performance
profile runs benchmarks against their existing build; it does not repeat the repository build or
TypeScript 7 compatibility pass.

Capture framework measurements locally from a complete Node and Chromium run:

```sh
node scripts/benchmark-framework-performance.mjs --output=.tmp/performance/javascript-framework.json
```

`EXACT_FRAMEWORK_BENCH_SAMPLES` controls independent process samples and defaults to `5`.
`EXACT_FRAMEWORK_BENCH_WARMUPS` controls per-process warmups and defaults to `2`. `--node-only` and
`--scenario=<name>` are diagnostic shortcuts; a run using either incomplete mode cannot write a
tracked baseline. `--keep-temporary` retains generated fixture artifacts only for compiler-output
diagnosis.

The focused reactive command includes the repaired compiled keyed-list DOM gate:

```sh
npm run benchmark:reactive
```

To isolate collection mutation costs, run `npm run benchmark:collections`. It measures ordinary
delete/reinsert, committed transactions, and aborted transactions for 1,000- and 10,000-entry Maps
and Sets. Setup and result verification are outside timing. Each case uses three warmups and ten
samples of 100 operations, without observers. Rollback includes the throw/catch cost and verifies
restored insertion order. Transactional deletion records ordering anchors in linear time; ordinary
deletion retains its constant-time path. This microbenchmark is a cost diagnostic, not an application
throughput estimate or a historical speedup claim.

The reactive benchmark also measures scope-owned deep-chain settlement and an equal-result diamond.
The chain guards affected-graph traversal cost; the diamond verifies that equality prevents
downstream execution while reporting settlement timing alongside the collection scenarios.

The shipping fixture also has a manually invoked retained-heap regression test. It warms the
compiler-generated hydratable SSR root with production marker behavior, forces full collections,
and verifies across 1,000 measured requests that each batch plateaus with zero surviving component
instances or effect scopes. A separate retained-heap ceiling catches unowned retained values:

```sh
npm run test:heap -w @exactjs/sample-shipping-calculator
```

This guard is intentionally excluded from ordinary correctness runs because exposed garbage
collection and process heap measurements are diagnostic, environment-sensitive operations.

The paired allocation-sampling guard profiles collected as well as surviving objects after warmup.
It detects regressions that restore marker-mode VNode fallbacks, reactive wrappers for declarative
module collections, nested subtree flattening, eager response-stream encoding, allocation-backed
UTF-8 validation, or key/entry arrays during attribute traversal:

```sh
npm run test:allocation -w @exactjs/sample-shipping-calculator
```

Dependent-foundation candidates are measured one at a time in isolated Node processes:

```sh
npm run benchmark:performance-foundations -- --scenario=transport
```

The supported scenario names are `transport` and `build-host`.
`EXACT_PERFORMANCE_FOUNDATION_SAMPLES` controls outer process samples;
`EXACT_PERFORMANCE_INNER_SAMPLES` controls observations inside each process. Publish only bounded summaries of accepted measurements; keep the production workload as a
before/after guard when it protects a meaningful regression.

The completed render-program, bounded-async-SSR, and hydration-publication experiments remain in
the historical evidence, but their handwritten generic-tree comparators were removed with the
native VNode architecture. Current SSR and hydration coverage uses compiler-produced TSX in the
framework benchmark instead.

## Measurement contract

The framework suite:

- compiles its TSX fixtures through the production Vite adapter rather than branding a handwritten
  benchmark component as a substitute for compiler output;
- treats fixture compilation, component construction, scenario assertions, browser startup, and
  missing structured output as setup failures rather than slow samples;
- records medians, nearest-rank p95, minimum, and maximum values from fresh Node or Chromium
  processes;
- performs warmups inside each sample process so one sample's optimized state and garbage
  collection cannot contaminate another sample;
- records Node, operating system, CPU, Chromium version, sample count, and warmup count;
- reports raw, gzip, and Brotli sizes for built artifacts and representative SSR and operation
  payloads;
- uses portable elapsed-time and heap measurements for release evidence; and
- exposes garbage collection only for the repeated mount/unmount plateau scenario, without making
  an exact engine-specific byte count a pass condition.

Production fixture builds are also repeated in clean Node processes. Their emitted raw and
compressed byte sizes must be deterministic before the suite reports a build baseline.
Framework-comparison applications with separate Vite client/server configs use
`buildExactViteApplication()` so both emissions share one process and native project generation;
measuring two unrelated CLI startups would obscure compiler and emission work.

## Scenario coverage

The reactive suite includes subtree disposal while unrelated paused computations remain queued.
It measures removal separately from queue setup and verifies that unrelated work survives and runs
on resumption. The [focused experiment record](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/scope-disposal-and-compiler-traversal-2026-09-05.md)
retains the empty-queue counter-metrics and the compiler-traversal experiment's inconclusive timings.

| Area                 | Scenarios                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Startup and mounting | Static and dynamic mount, compiled module evaluation, production fixture build, and raw/gzip/Brotli artifact sizes.                                                            |
| Hydration            | Renderer adoption of matching SSR-style root markers while retaining existing DOM identity.                                                                                    |
| Interaction          | First delegated click, scalar publication, branch replacement, and 1,000-item keyed rotation.                                                                                  |
| Update matrices      | Keyed unchanged/change/sparse/rotation/append/prepend/truncate/splice/replacement, mixed-priority scheduling, and a focused DOM transaction that protects focus and selection. |
| Framework boundaries | Enhancement target reroute, Activity park/reactivate, Suspense settlement, and mixed-tree mount/teardown.                                                                      |
| Component ownership  | Creation/disposal of 2,000 compiled instances, inspectable state/API access, and repeated DOM mount/unmount heap plateaus.                                                     |
| SSR                  | Synchronous trees, CPU-bound async work, I/O-bound async siblings, and progressive first-chunk/completion timing.                                                              |
| Server protocol      | Ordinary operation requests and streaming batches with representative payloads and compressed/uncompressed sizes.                                                              |
| Browser              | Every client/component scenario above in the current Playwright Chromium build, with a new browser process per sample.                                                         |

Server GC telemetry reports unavailable values when the runtime does not advertise `gc` observation
support. Null counts are not zero collections, and comparative GC metrics are omitted when any
participant in the lane lacks observations. Native Bun inspector measurements are separate diagnostics
because enabling the inspector affects throughput. See the
[native GC investigation](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/bun-native-gc-ssr-2026-09-11.md).

The framework comparison additionally records FCP, LCP, long-task count and duration, total
blocking time, element/total/comment/text DOM size at semantic readiness, post-GC JavaScript and
embedder heap, backing storage, retained DOM and listener counts, per-script decoded and executed
bytes, function inventory and invocation counts, and parse/compile/evaluation trace attribution.
Executed bytes use the most-specific V8 coverage range for each source interval, so an uncalled
function body is not hidden by its executed top-level script range and nested ranges are not counted
twice. Coverage is best-effort so V8 optimization remains enabled during percentile timing.

One separate diagnostic pass per framework records sampling CPU profiles for cold startup and the
first optimistic interaction plus sampled allocation sites before and after post-interaction
collection. Those profiles preserve raw V8 nodes and ranked URL/function locations for attribution;
the pass uses a 100-microsecond CPU interval, a 4 KiB heap interval, and 6x CPU emulation for the
interaction capture. Attribution-enabled eXact diagnostics join precise executed coverage to source maps and
retain the bundler's actual per-module rendered lengths. Parsed and compiled function counts remain bundle-level
when Chromium omits source locations. An optional post-GC strong-edge dominator snapshot supports retained-heap
investigation without embedding its large raw snapshot. Profiler overhead is intentionally excluded from latency populations, and
sampled heap bytes are not treated as exact retained-heap accounting.

The separate `measure:heap` collector produces balanced, unprofiled post-claim snapshot categories
for the documentation's stacked heap chart. Its arithmetic category means reconcile to mean snapshot
self-bytes, including native nodes; they do not partition the separately measured JavaScript heap
scalar. Capture and publication instructions are in [framework comparison](framework-comparison.md).
The [2026-09-06 capture](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/performance-baselines/framework-comparison-heap-composition-2026-09-06.md)
retains the raw rounds, classification rules, and interpretation.

The hydration scenario intentionally measures adoption separately from SSR generation. SSR output
size and generation cost have their own scenarios, which keeps the two costs attributable.

Hydration-publication reports separate application-payload, framework-envelope, and whole-response
sizes. Component names, boundary identities, prop schemas, and prop values are application data;
they are not charged to framework size merely because the compact representation stores them in a
response table. Whole-response raw/gzip/Brotli sizes remain required transport counter-metrics so
an envelope optimization cannot hide an application-facing network regression.

## Baseline and regression policy

The tracked JSON is authoritative measurement evidence for its recorded environment. Compare a
candidate on the same machine and software versions when possible. Investigate changes in the
primary metric together with bundle, payload, heap, and tail-latency counter-metrics; do not accept
a gain that merely moves work into startup or retained state.

The compiled 1,000-item DOM rotation remains a coarse safety gate at a 2,000 ms p95. That generous
limit detects construction failures, runaway reconciliation, and gross regressions without
pretending noisy local timing is a precise cross-machine budget. Add tighter release budgets only
after repeated baselines establish normal variance on supported environments.

Allocation experiments should report both their focused representation measurement and a
production-compiled DOM fixture. Empty scope or component populations isolate baseline ownership
cost, while static, mixed-lifecycle, and keyed-list fixtures detect work shifted into mounting,
patching, or teardown. Do not compare a candidate directly with an older tracked scenario when
intervening renderer features materially changed that workload; first establish a current
same-tree baseline or describe the result as cumulative.
