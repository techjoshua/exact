# Performance measurement

This guide owns measurement commands, correctness admission, and interpretation. The
[framework comparison](framework-comparison.md), [load guide](ssr-load-testing.md), and
[comparison methodology](../framework-comparison/methodology.md) define their respective workloads.
Follow the [retention policy](performance-baselines/benchmark-retention.md): raw captures and
per-run generated reports belong in ignored local storage.

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

The latest full framework capture measured clean 0.7.0 release revision
`67d075aa` on September 28, 2026 (UTC), including the SSR callback-allocation changes and
bounded adaptive-admission rechecks. Its
[structured summary](performance-baselines/results.json) records browser, startup, heap,
Node/Bun buffered and streaming, sustained-load, and native full-stack measurements.
The public charts consume compact derived inputs under `apps/docs/src/data`. Individual charts
retain their measurement dates. Focused diagnostics retain their own source identities.

All 39 build, correctness, measurement, and guard phases passed. Production builds used committed
source and native loopback in one private network namespace. Node was 26.9.0 and Bun was 1.4.2.
The user rebooted the PC before the preceding focused diagnostics and this full run, and reported
no other workload. Browser timing used 30 balanced rounds. Startup profiling used 10 samples per
framework at each of three CPU rates, and the separate heap capture used five rounds. Sustained
captures used two reversed process populations. Each scheduled rate had 30 seconds of warmup and
60 seconds of measurement per framework and population.

Scheduled-demand tail latency improved substantially from the preceding full capture at
`be681774`. At 10,000 offered RPS, Node buffered p99 fell from 55.84–56.38 ms to 4.70–6.75 ms,
Bun buffered from 53.60–58.50 ms to 5.03–5.28 ms, and Node streaming from 73.73–74.88 ms to
2.65–3.25 ms. Each now served approximately 9,999.5 valid RPS. Across both populations, their
respective deadline misses were 20, 11, and 21 out of 1.2 million offered arrivals, with no
capacity misses or request errors. These ranges span driver percentiles across both populations,
not one percentile computed from pooled requests.

At 8,000 offered RPS, p99 was 3.12–3.38 ms for Node buffered, 4.14–5.57 ms for Bun buffered,
1.90–1.92 ms for Node streaming, and 5.92–6.03 ms for Bun streaming. All four served essentially
the full offered rate. Warmup still included larger tails and missed arrivals. The bounded probe
protects reassessment after a policy has been selected, and does not remove initial policy
discovery costs.

Bun streaming remains capacity-limited at 10,000 offered RPS. It served approximately 7,690 valid
RPS with 23.03% capacity misses and 74.43–75.33 ms p99. The preceding full capture served about
6,343 RPS with 36.49% capacity misses and 98.24–103.04 ms p99. Its recovery at 8,000 RPS does
not establish recovery at every offered rate. eXact recorded no request errors in any sustained
capture. React's Node streaming cases recorded 1,124 measured request errors. Warmup errors are
accounted for separately. Errors, warmup results, demand misses, and population latency ranges
remain visible in the maintained summary and derived capacity charts. Concurrency captures were
error-free.

At preloaded concurrency 128, eXact delivered 14,187 valid RPS for Node buffered responses
(-3.0% from the preceding full capture), 16,425 for Node streaming (+28.0%), 12,622 for Bun
buffered responses (+16.1%), and 8,939 for Bun streaming (+26.7%). React's corresponding changes
were -6.3%, +25.0%, +0.6%, and +18.8%. Node buffered normal-loading throughput changed from
3,364 to 3,315 valid RPS, separately from the preloaded rendering workload. Throughput did not
improve uniformly, even where scheduled-demand latency improved.

Matched tracing before this full run identified disruptive admission-policy reassessment, and
focused before/after measurements supported bounding those probes. This full run confirms low
measured tail latency across both populations for the paths described above. Its historical
comparison also includes a reboot and host variation, so it cannot attribute every change to
source code. The earlier pre-0.7.0 Node buffered 10,000 RPS capture at `58b193dd` had 3.47–3.70 ms p99, which
remains lower than this run. The current result resolves the large measured tail spikes without
establishing a universal improvement over every earlier baseline.

Client timing and startup CPU were refreshed on September 28, 2026 (UTC) at clean revision
`74d44614`, after the hydration traversal changes. The refresh passed all 39 production browser
correctness and presentation checks, used 30 balanced timing rounds and 10 startup samples at each
of 1×, 4×, and 6× CPU throttling, and retained measurement round 25 on native loopback. SSR,
native full-stack, and the separate heap-composition chart retain their earlier captures.

Compared with the preceding client capture at `67d075aa`, eXact navigation mean increased from
27.22 to 28.46 ms and p95 from 31.1 to 31.9 ms. First-contentful-paint mean increased from 55.47
to 57.60 ms. Optimistic feedback mean decreased from 2.32 to 2.25 ms, while settlement changed
from 12.05 to 12.14 ms. Mean post-GC JavaScript heap increased from 2.542 to 2.549 MB.
Transferred script bytes decreased by 264 bytes, approximately 0.1%.

The other four frameworks provide a reference for changes between captures. Dividing eXact's
after/before ratio by the equal-weight geometric mean of their ratios gives a relative navigation
increase of 3.1% for the mean, 3.0% for p50, 4.1% for p95, and 0.7% for p99. The mean increase
is 2.5% relative to React, 4.7% to SvelteKit, 1.9% to Nuxt, and 3.5% to TanStack Start.
These adjustments assume comparable host effects. The references moved differently, so they
provide a sensitivity check rather than a measurement of the code change alone.

Tail width describes how much slower the upper percentiles are than the median. eXact's
p95 minus p50 narrowed from 3.4 to 3.1 ms, while p99 minus p50 remained 3.9 ms. Its navigation
distribution shifted upward without a wider measured tail. React and SvelteKit narrowed both
gaps, however. Relative to their p99 changes, eXact increased by 5.7% and 7.8%, respectively.
Nuxt's p99 increased from 42.8 to 49.5 ms, which makes the combined p99 comparison more favorable
to eXact. With 30 samples, p99 is the maximum and p95 is the second-largest observation.
An exploratory bootstrap of shared round indexes gives a 95% interval of approximately
−1.4% to +8.0% for the reference-adjusted mean change. It assumes exchangeable rounds and
cannot correct systematic differences between capture conditions. These results do not establish
a code-caused slowdown or a client-speed improvement.

Startup script CPU means increased from 24.63 to 25.90 ms at 1×, 101.66 to 103.83 ms at 4×,
and 156.42 to 163.54 ms at 6×. This run does not demonstrate an overall client-speed improvement.
React, Nuxt, and TanStack also recorded higher navigation means, while SvelteKit stayed nearly
unchanged. These historical measurements do not isolate the traversal changes from host variation.
Focused reductions in repeated sibling scans need not produce a visible improvement on this small
page, and hydration work occurs after the load event in the previously traced runs.

### Choosing a measurement scope

A matched client diagnostic compared the traversal modules at `19215419` with `74d44614`
using the same compiler, dependencies, SSR document, and replay transport. Both populations
alternated 204 samples of each eXact variant and SvelteKit, with the eXact replay ports swapped
in the second population. All measured pages completed hydration and the claim interaction
without browser errors. Mean navigation changed from 27.74 to 27.64 ms in the first population
and from 27.105 to 27.102 ms in the second. P99 decreased from 32.0 to 31.4 ms in the first
and increased from 31.9 to 32.3 ms in the second. The tail changes did not repeat consistently.
These measurements establish neither a repeatable navigation regression nor a meaningful
navigation improvement. The browser bundle shrank by only 175 bytes out of approximately 230 KB.

Separate Chromium operation measurements showed the intended benefit for large sibling workloads.
Snapshotting 500 child slots decreased from 6.82 to 0.042 ms per pass. Collecting 1,000 authored
siblings with zero, one, or ten framework ranges was approximately 36–41% faster. A stress case
with 1,000 framework ranges varied between runs. Capturing 2,000 untouched form controls improved
slightly, while capturing edited controls was effectively unchanged. These are measurements of
individual hydration operations, not whole-page hydration. The maintained results retain both
navigation populations, separate startup traces summarized by phase, and the operation summaries.
They supplement the production charts without replacing their measurement populations.

A loading-strategy diagnostic kept the production bundle unchanged and compared the normal module
script with two inline bootstraps. One imports the bundle after `load`. The other imports it
immediately and includes a `Link` response header with `rel="modulepreload"`. Two balanced
populations used 204 samples per strategy and SvelteKit, reversing eXact replay ports for the
repeat. Separate header-only and HTML-link-only probes both fetched the bundle in Chromium.
Every measured eXact navigation fetched the bundle once and received a complete paint observation.

Immediate import plus preload decreased navigation mean from 22.58–23.01 to 8.96–9.29 ms.
Navigation p99 decreased from 26.6–30.5 to 14.6–21.3 ms, but its distance above the median did
not narrow consistently. First contentful paint was approximately 1 ms later than normal loading,
and scenario readiness, observed when the page first reports “Live service,” was 3.5–4.4 ms
later. After-load import produced 19.28–19.35 ms navigation means and 4.6–4.7 ms later readiness
than normal loading in these same populations. The earlier load event for immediate import does
not establish earlier visible content or application readiness. These measurements retain the
application's existing deferred hydration scheduling after its module executes.

All timed pages completed the claim interaction once ready. Separate checks held the dynamically
imported bundle until after clicking the server-rendered button. Both import strategies retained
the SSR text, stylesheet, and root dimensions, but lost that early click. Normal loading handled
the click after load, and both import strategies handled a subsequent click once ready. These
remain diagnostic loading strategies. Adoption would require early-interaction handling and a
clear choice about when hydration should start. The maintained results retain both populations
and the preload probes. These cold, uncompressed loopback captures do not measure warm-cache or
CDN behavior and do not replace the production chart populations.

This full run took about 90 minutes. Scheduled-demand captures consumed 48 minutes, preloaded
concurrency captures 19 minutes, and normal-loading captures 8 minutes. Their fixed measurement
windows dominate the cost. Running load generators concurrently on the same machine would make
those measurements compete for resources.

For a targeted change, the commands below can run a focused workload and its correctness checks
before requesting a complete release comparison. The browser, startup, and heap collectors took
about 2.1 minutes of measurement in this run, excluding builds and correctness admission. A
matched before/after comparison of an affected workload is more useful for attributing a small
change than repeating the full matrix against an older capture. Focused results retain their own
source identity and do not replace unmeasured groups in the published charts. The full matrix
remains the acceptance scope for a complete comparison refresh.

### Additional release checks and theme cost

The standard release performance profile passed its reactive/DOM, framework client/server,
compiler workflow, theme, DevTools, and React compatibility checks. Collection transactions,
Node/Bun server diagnostics, transport/build-host diagnostics, and React adapter measurements
also completed. The full shipping heap and allocation guards passed again at `67d075aa`, as did
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
