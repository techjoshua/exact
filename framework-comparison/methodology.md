# Comparison methodology

## Purpose

The public performance page now uses independent-driver sustained SSR capacity evidence, with
preloaded and normal-loading requests explicitly separated. Its scheduled-arrival tables include
missed admission and latency. Earlier short-window RPS figures are historical diagnostics, not the
current capacity headline. The current sustained comparison covers eXact and React only. See
[`docs/ssr-load-testing.md`](../docs/ssr-load-testing.md) for the protocol; browser, response-time,
payload, and retained-memory captures remain separately dated.

The suite answers two different questions without conflating them:

1. How does each framework behave when only its browser-facing implementation varies?
2. What does a complete idiomatic application look and perform like when the framework owns the full stack?

The controlled-service and native-full-stack tracks answer those questions respectively. Both require the
same visible behavior, fixture semantics, authorization outcomes, conflict handling, and accessibility.

## Fairness rules

1. A participant is optimized for its own framework, not mechanically translated from another participant.
2. Fixtures, protocol types, test utilities, and the static presentation stylesheet are shared. Component
   implementations, stores, cache policies, routing, and server invocation code remain participant-owned.
   All participants must reproduce the same visible presentation and behavior. Framework-native architecture
   does not permit different fonts, backgrounds, spacing, controls, or responsive layouts.
3. The same Node major version, browser build, machine, process topology, database snapshot, and network/CPU
   profile apply to every measured run in one result set.
4. Production builds are measured. Development builds may be measured separately for build and feedback
   metrics, but never mixed with runtime results.
5. A scenario must pass its correctness assertions before its timing is accepted.
6. Warm and cold measurements are labeled and reported separately. Comparable timing populations use balanced
   round interleaving: every round measures one sample or window from each participant, rotations distribute
   order positions, and alternating cycle direction counters monotonic host drift. The controlled browser runner
   uses fresh cache-disabled contexts in a warm browser process, after one discarded scenario per participant.
7. Raw samples, environment metadata, participant commit, dependency lockfile, and harness version accompany
   every summary.
8. Participant implementations must pass the shared observable-behavior contract. Architecture notes and
   later corrections are recorded with the evidence rather than silently rewriting historical results.
9. Every sampled metric is summarized at p50, p75, p95, and p99 with the same nearest-rank convention. Reports
   must not substitute a smaller hand-picked metric or percentile set for an architectural comparison.
10. Production client resources must be discoverable from the document head through the framework's idiomatic
    module script, preload, or equivalent mechanism. A participant must not delay discovery until after its SSR
    body merely because its application document uses a less efficient template.
11. Production artifact identity hashes the ordered relative path and bytes of every measured output file.
    Browser and startup samples also hash a participant-neutral semantic DOM record after their correctness
    boundary. Every sample for one participant and every participant in the controlled track must produce the
    same response identity; a mismatch invalidates the run rather than becoming a timing sample.
12. Complete SSR response identity retains exact byte-length stability. TanStack Router's serialized
    request-time match timestamps are canonicalized only for the content hash because they govern cache
    staleness rather than application output; all other markup and serialized data remain identity-bearing.
13. Framework-generated source such as TanStack Router's route-tree manifest is excluded from authored-line
    complexity, but its emitted client and server code remains included in production artifact measurements.
14. Controlled correctness includes same-browser presentation comparisons before JavaScript and after
    representative interactions at desktop and mobile sizes. References are captured from the current eXact
    participant on the same browser and operating system, not accepted from historical screenshots. The
    comparator permits glyph antialiasing differences, but no perceptible differing pixels. Visible copy is
    checked separately. A presentation failure blocks measurement just like a behavioral failure.

## Performance dimensions

The browser runner will collect navigation response time, first contentful paint, largest contentful paint,
interaction latency, long tasks, transferred and executed JavaScript, heap, and scenario settlement time.
Server runs collect request throughput, p50/p75/p95/p99 latency, CPU, post-GC memory trends, server
artifact size, stable response identity, and cold-start behavior.
Build runs will report clean build, incremental rebuild, and emitted raw/gzip/Brotli bytes.

Scenario settlement is a semantic boundary, not merely the end of an event handler. For example, claiming an
incident settles after the server accepts or rejects the expected version and the UI displays the authoritative
owner and status. Optimistic feedback latency is recorded independently from settlement latency. Both interaction
durations use browser event and mutation timestamps, so test-driver actionability checks and polling intervals do
not become framework latency. An activation performed in response to the click remains inside the measurement.
Before dispatching the measured interaction, the harness waits for the shared `Live service` state so
SSR-visible controls cannot be clicked before a participant has hydrated and attached its client behavior.
Each admitted sample measures the first claim on its fresh page. Process warmup does not turn this
into a measurement of repeated same-page interactions. A warmed interaction lane must retain real
optimistic state changes and authoritative version checks, identify setup/navigation work, and
report transport warmup separately. Reclaiming an already-owned incident without changing its
optimistic fields is not an equivalent warmed workload.
The harness observes the existing owner and version elements rather than serializing the document body. It
records request dispatch, HTTP headers, JSON decoding, incident-stream receipt, and the two visible DOM mutations
from outside participant code. These diagnostic phases do not add callbacks, attributes, state, or scheduling
work to any participant.
Each controlled participant owns one live-service connection and routes incident and job events to its mounted
surfaces. Authoritative resources are version-deduplicated when the same update arrives through both that stream
and the mutation response.

Settlement includes transport, browser task scheduling, and the winning authoritative delivery path.
It ends at an observed DOM mutation, not at presentation of a painted frame. Chromium may defer
network delivery until a frame after input. Automation waits are outside the timer, but their
alignment with the display frame can still affect settlement. Interpret small mean differences
alongside request, stream-receipt, and DOM-update phases. Browser-policy overrides and deliberately
shifted input timing are diagnostic controls, not replacements for the published scenario.

Participants may preserve framework-native identity for unchanged resource branches. The eXact participant
retains an unchanged comments collection during owner/status merges so its fine-grained renderer does not perform
unrelated response-log work.

The controlled browser memory signals are collected after the measured interaction settles and an explicit
garbage collection. They report used and reserved JavaScript heap, embedder heap, backing storage, documents,
DOM nodes, and event listeners. They therefore describe post-interaction retention for that page state, not a
process-wide footprint or proof by themselves that an application does or does not leak.

First contentful paint is read only after a buffered paint observer or a subsequent rendering opportunity confirms
that Chromium published the entry. A missing paint entry fails the sample instead of silently reducing the
population used for percentile calculation. The standard `PerformancePaintTiming.startTime` is the sole FCP
measurement. Measured document requests use real HTTP to a common replay server serving captured production HTML and assets.
Framework servers stop after capture; there is no browser-route interception or proxy in the measured path.
`COMPARISON_CLIENT_MODE=live` retains direct participant-server navigation as a separate full-application test. Heap collection
occurs after interaction timing so forced garbage collection cannot turn optimistic feedback into a cold-allocation
benchmark.

### Cold-start CPU profile

The startup CPU track uses the same production artifacts and correctness gate but creates a fresh browser context
and disables Chromium's HTTP cache for every sample. Network traffic remains on unthrottled local loopback so the
profile isolates CPU work rather than estimating transfer time. Separate profiles run without CPU throttling and
with Chromium's 4x and 6x CPU emulation.

Tracing begins before navigation and ends only after the shared `Live service` readiness state. Chromium trace
events report JavaScript parsing, compilation, and evaluation, while the Performance domain reports total script
and task duration. The trace also records navigation, first-contentful-paint, and readiness markers so work on the
paint-critical path can be separated from later activation. Best-effort coverage reports emitted script extent
and invoked-function counts by chunk URL without disabling optimized V8 code; a function collected before the
capture can be absent, so raw samples and their variance remain authoritative. Embedded summaries always carry
the common p50/p75/p95/p99 set so consecutive runs can be compared without reconstructing omitted percentiles.

After all percentile samples, one separate diagnostic navigation per participant records sampling CPU profiles
for startup and the first optimistic interaction. Sampling heap profiles retain allocation-site attribution for
startup and compare interaction allocations immediately before and after an explicit collection. An optional
diagnostic heap snapshot computes strong-edge dominators after collection without retaining the raw snapshot.
These profiles
use a 100-microsecond CPU interval and a 4 KiB heap interval; interaction CPU capture uses 6x Chromium emulation
to collect enough samples from sub-millisecond framework work without changing the ordinary timing lane. They
are not timing samples: their instrumentation overhead must not be interpreted as participant latency. Raw V8
profiles accompany ranked URL, function, and source-location summaries so a later analysis can revisit attribution
without rerunning the suite. The heap sampler is statistical and its sampled bytes are not exact heap accounting.
The eXact diagnostic bundle also substitutes compile-time profiling policies for detailed hydration
and DOM adoption phases. Installed-package policies are constant false, and the ordinary production
comparison bundle excludes those timers and phase strings.

Trace categories can contain nested work, so parse, compile, evaluation, and total script duration are independent
signals and must not be added together. Parse and compile trace durations may also aggregate background-thread
work, while Performance-domain script duration describes main-thread wall time. CPU throttling is a repeatable
desktop-browser emulation rather than a claim about a particular mobile processor. Chunk URLs and precise
coverage provide bundle-level attribution; source-map attribution inside a chunk requires a separate sampling
profile. Attribution-enabled eXact builds also retain Rollup's per-module rendered lengths and join precise
coverage to the emitted source map. Chromium's aggregate parsed and compiled function counts remain bundle-level
when its trace events omit script locations; the harness reports that absence instead of distributing those
counts speculatively across modules.

### Isolated SSR profile

The SSR track starts one production participant per child process so framework heap, RSS, external
memory, and CPU ownership remain attributable to that framework rather than the controlled fixture service.
Comparable workers start concurrently and remain warm simultaneously, but requests and fixed-duration windows
are issued to only one participant at a time in balanced round-interleaved order. Concurrent startup prevents
the admitted historical artifact or a framework from inheriting a fixed process-age, listener-port, or scheduler
slot before request-order balancing begins. Participant
metadata declares the production transport used for each runtime. The worker imports that target-local
server artifact directly and owns its listener; it does not start a shell, package manager, or descendant
application process. Shutdown first uses the worker's control endpoint, then terminates only that exact
child if graceful cleanup misses its deadline.

Every measured route obtains the same immutable session and incident snapshot from the controlled
service before rendering `/incidents/inc-101`. Client-observed TTFB and full-body time therefore describe
the complete SSR route. A Node HTTP worker records response first-byte and finish phases; a native Fetch
worker records handler completion when its immutable `Response` becomes ready. The report records this
worker-measurement contract beside the transport so unlike internal phases are not mistaken for equivalent
socket events. Sequential requests use warm keep-alive connections.
The load generator owns one bounded `node:http` keep-alive agent per participant and closes it when
that participant finishes. Reusing those connections prevents client-side ephemeral-port exhaustion
from being misreported as framework capacity while preserving exact process and socket ownership.
Before the timing population starts, the harness probes both controlled-service resources repeatedly and records
the resulting latency distribution. Every browser, startup-CPU, and comparable SSR timing round uses a balanced
rotation keyed by the recorded measurement round and track offset. Successive rounds move every framework through
every order position, and alternating cycles reverse direction, while every exact order remains stored in the raw
result. This prevents one framework from consistently inheriting host drift, background activity, or service
temperature and makes residual order effects auditable.

Cold-start populations, post-GC retention, response decomposition, and instrumented CPU/allocation diagnostics
remain isolated because simultaneous processes or profiling changes would contaminate their ownership. When an
admitted historical eXact server artifact is available, it may run as another interleaved worker under the same
transport. That direct paired population is preferred for estimating a small before/current change; unchanged
React, SvelteKit, and Nuxt controls remain useful for relating a current run to older unpaired checkpoints.
TanStack Start is reported as a fifth participant but is not a normalization control because it shares
React's renderer and would otherwise give correlated React behavior double weight.

SSR evidence captures the repository-dirty flag once before starting services or creating raw output. The
evidence files produced by the run therefore cannot cause the run to mark itself dirty.

The bounded concurrent lane reports **16-request burst completion time** across 50 finite waves;
it is not the capacity headline. Saturation levels instead use 50
500 ms target, closed-loop windows; each client immediately replaces a completed request until the window
closes, then outstanding requests settle. Throughput therefore has the same window population for every
participant, while request-latency observation counts legitimately differ. Those distributions retain every
published percentile and report each participant's count rather than truncating faster participants to a
common size. After summarization, the runner releases the high-volume request and worker arrays; fixed-size
throughput-window samples and finite-lane raw observations remain in the result.
Before either concurrent lane, every participant receives one discarded two-second capacity prime at c32.
The worker then resets telemetry. Startup and sequential lanes therefore retain their lighter warm-up
contract, while concurrent and saturation results do not mix V8 tier-up work with steady-state capacity.
The capacity headline is sustained c32 **aggregate RPS**: total completed requests divided by total actual
window elapsed seconds, including final drain. The arithmetic mean and percentiles of individual window
rates remain separate statistics. Response bodies are buffered for one window and hashed and validated
after its timer stops, so validation does not delay replacement requests. This temporarily retains client
body buffers; local client, service, and worker resource contention remains part of the measured setup.
The `deferred-validation-aggregate-v2` method is not directly comparable with earlier rates that included
validation in the load loop. Individual latency percentiles remain available;
aggregate process CPU is normalized by completed requests because overlapping requests cannot be assigned
independent process-CPU intervals safely.

`node framework-comparison/src/measure-ssr-window-sensitivity.mjs` compares 100, 250, 500, and 1000 ms
windows at c16 and c32 across four fresh Node worker populations. Duration, concurrency, and framework
order are balanced; all ordered window counts and elapsed times are retained. Set
`COMPARISON_SSR_WINDOW_STUDY_OUTPUT` to select its output file. Production builds must already exist.
This closed-loop capacity test does not estimate latency under a fixed external arrival rate.
The main capacity default is 500 ms; attribution diagnostics retain 100 ms windows and record their
own duration. Override these independently with `COMPARISON_SSR_SATURATION_WINDOW_MS` and
`COMPARISON_SSR_ATTRIBUTION_WINDOW_MS`.
Client concurrency is limited to 128, matching the owned keep-alive agent's socket capacity; larger
requested values are rejected instead of silently queueing behind that limit.

Every Node integration records participant work from handler entry through the response `finish` event;
native Fetch integrations record handler entry through immutable `Response` readiness. The directly hosted
eXact and React integrations
also separate controlled-service loading, framework rendering, document-envelope construction, rendered
fragment bytes, and complete response bytes. These detailed phases are attribution evidence, not a claim
that framework-owned server adapters expose identical internal boundaries.

Five diagnostic lanes test likely causes without replacing the end-to-end result. The equal-payload lane
runs each ordinary framework route while padding the complete body to the same byte count. The payload sweep
serves renderer-free bodies at several exact sizes through each participant's declared transport. The
render-only lane reuses preloaded fixture data for integrations that expose a direct renderer and, on Node,
captures statistical heap-allocation and CPU summaries in separate passes. Sampled bytes, sample count,
sampled CPU time, top sites, and URL attribution
identify likely allocation work; the large inspector tree is not embedded in the main result, and sampled
bytes are not exact allocation accounting. Unsupported renderer or inspector combinations remain
explicitly unsupported rather than receiving zero values. A sustained preloaded lane measures the same
renderer and response path with one cached immutable service snapshot. A separate service-phase lane adds
fetch and JSON-decode clocks; those clocks never run in primary requests. Finally, a response-decomposition
control operation accounts for semantic markup, marker categories, framework identity attributes,
hydration data, comparison data, and the document envelope without adding work to a measured response.
An attribution-only lane that encounters a transport failure is recorded as unsupported with its participant,
concurrency, and round context. Its partial timings are discarded, while completed primary and independent
diagnostic populations remain valid and continue to the per-runtime checkpoint.
On Windows, Bun workers default their maximum concurrent HTTP requests to 64, matching Bun 1.3.5's observed
reusable per-origin connection population. Higher simultaneous upstream populations otherwise create one-shot
sockets and can exhaust Windows' bounded ephemeral-port range during the long diagnostic population. Explicit
operator configuration overrides the default, and the report records the effective worker environment.

Memory checkpoints force collection outside the measured latency lanes, then record `heapUsed`,
`heapTotal`, RSS, external memory, and array buffers after equal request batches. A least-squares
byte-per-request slope is a bounded retention signal: a positive short-run slope warrants investigation
but does not alone prove an unbounded leak. Response hashes must remain stable for the immutable input,
and every body must contain the selected incident, so a fast error, empty shell, or cross-request mutation
cannot be accepted as an SSR sample.

GC event telemetry checks the runtime's advertised `PerformanceObserver` entry types. When `gc`
is unsupported or observer setup fails, it reports `available: false` with null count and duration;
load-process samples similarly report `gcAvailable: false`. Unsupported observations are not zero
collections. Comparison adapters omit GC metrics from a lane if any participant lacks them. Node
observations remain numeric, including a genuine zero-event interval. Historical captures without
availability metadata retain their original values and must not be treated as proof of GC support.
Bun's native inspector can collect GC events in a separate diagnostic, with inspector overhead
reported separately from ordinary throughput runs.

CPU lanes read cumulative process counters without forcing collection. Forced collection is confined to
the separate retention lane, so benchmark bookkeeping is not charged to framework request CPU.
Bun's event-loop monitor has a coarser sampling interval than Node's. After each telemetry reset, the
worker therefore admits one idle monitor observation before the measured requests begin; this guarantees
that very short low-concurrency lanes have a real histogram sample without adding the wait to request
latency, throughput, or CPU measurements. The reset gate applies to both native `Bun.serve` and Bun's
`node:http` compatibility transport; neither transport may publish a zero-observation lane.

Node and Bun results are separate runtime rows over target-local production artifacts. A framework's
native runtime integration is part of the comparison rather than normalized away. Frameworks without a
native Bun host may use Bun's explicitly reported `node-http-compat` transport; that diagnostic must not
be described as native Bun support.
The collector writes an immutable timed checkpoint after each runtime. A later runtime or optional diagnostic
may mark the complete run unsuccessful, but it cannot erase a completed Node or Bun population.

## Browser heap composition evidence

The dedicated heap composition lane is an untimed diagnostic: no CPU, allocation, or coverage profiler
runs in its pages. After one discarded scenario round, fresh cache-disabled contexts execute the same
incident load and authoritative claim in balanced interleaved rounds. Explicit collection precedes
each snapshot. Keep raw node-type self-byte totals, sample orders, browser version, and artifact hashes.
Category means must add to the mean snapshot self-byte total; category medians need not add and must
not be presented as a partition of the median total. The public chart retains separate capture provenance.

Classify `code` as V8 code/metadata, `hidden` and `object shape` as internals/shapes, and report ordinary
objects/arrays/closures/regexps, strings, native nodes, and remaining types separately. Internal nodes
are not all compiled-code metadata, and ordinary node types do not establish application ownership.
Count self-bytes once per node. Snapshot totals include native representations and differ from both
`JSHeapUsedSize` and total browser process memory. Never splice snapshot categories into a separately
measured heap scalar or reuse an old category proportion to explain a new measurement.

## Complexity dimensions

Complexity is reported as a profile rather than one synthetic score:

- authored production and test lines, split from generated output;
- direct and transitive production dependencies;
- configuration and framework glue;
- explicit client/server boundaries and manual transport code;
- cache invalidation, rollback, cancellation, and synchronization sites;
- build and test commands;
- independently inspectable framework-specific source and boundary plumbing; and
- effort and code touched for the same change request across participants.

Comments, formatting, and tests must not be removed merely to improve line counts. Generated code and lockfiles
are disclosed but excluded from authored-line comparisons.

## Result interpretation

No overall winner is calculated. Results describe tradeoffs for named scenarios and environments. Differences
inside the run's noise interval are reported as indistinguishable. A result report must name limitations,
failed or skipped scenarios, framework-specific optimizations, and any contract variance.

## Captured-page client measurements

The controlled client runners default to `COMPARISON_CLIENT_MODE=replay`. Before timed work,
the harness resets the shared fixture and captures `/incidents/inc-100` from each production
framework server. It freezes that HTML and the matching client assets in memory, then stops all
framework servers and serves those bytes at the original origins through one Node HTTP implementation.
Hydration data and document security headers are preserved. Capture-time connection/framing headers
are regenerated; all replay responses use `no-store`, no compression, and no browser interception.
No missing resource may fall back to SSR: a missing request invalidates the capture.

Each sample creates a fresh browser context with the HTTP cache disabled. The browser process is
warm, not a fresh browser process per visit; one complete scenario per framework is discarded before
the ordinary browser and heap rounds. Balanced rotating rounds counter host drift. API actions and
SSE updates still reach the live shared service, reset before every scenario. Request-time hydration
timestamps are frozen with the HTML, not rewritten. Any resulting client revalidation remains real
client work. This is a client isolation experiment, not a simulation of production CDN caching or
streaming SSR. Navigation completion is the load event, not hydration readiness.

Raw evidence records the delivery mode, per-resource SHA-256 and byte size, retained document
headers, document request counts, sample orders, and build identity. The browser runner defaults to
30 rounds; public replay refreshes require at least 30 rounds, balanced across all five positions.
Heap snapshots and startup tracing run separately from ordinary browser timing.

Set `COMPARISON_CLIENT_MODE=live` to retain framework-generated HTTP navigation for a separate
full-application run. Never merge live and replay populations or interpret the method change as a
framework optimization. The shared correctness suite continues to test real framework servers.

From `framework-comparison`, run `npm run measure`, `npm run measure:heap`, and
`npm run measure:startup-cpu` for correctness-gated captures. Each command captures one page per
framework and reuses it throughout that command. To refresh public browser charts from repository root:

```sh
node framework-comparison/src/publish-client-report.mjs <raw-browser.json>
node scripts/component-local-target-abi/publish-docs-heap-report.mjs <raw-heap.json>
```

These publishers preserve independent server evidence. Keep raw captures in ignored local output
directories while validating and publishing. Update the maintained
[`results.json`](../docs/performance-baselines/results.json) with concise result summaries, sample
counts, methodology, environment, and source revisions, together with the derived public chart data.
Do not create dated reports or commit raw capture bundles or generated builds. See the
[benchmark retention policy](../docs/performance-baselines/benchmark-retention.md).

### Diagnostic server chart refresh

The docs publisher's `--diagnostics-only` mode refreshes sequential latency, finite burst
completion, retained-memory checkpoints, and payload composition from a complete SSR capture.
It leaves independent-driver capacity and browser evidence untouched, recomputes sequential
statistics from raw requests, and rejects incomplete or nonfinite latency populations. Counts for
sequential requests, bursts, and retention checkpoints are distinct in public metadata.

Shared-PC activity remains part of local benchmark uncertainty. Balanced rounds distribute drift
but cannot make instantaneous interruptions affect every participant equally. Do not discard slow
samples after the fact, pool different warmup regimes, or claim a small P99 change is a runtime
regression without repeated evidence and phase attribution.

### Runtime versions in published results

The default local and CI runtimes are Node.js 26 and Bun 1.4.2. Record the exact runtime
versions in each capture and show them with public server charts. Node 24 remains a supported
compatibility target; historical Node 24 measurements must not be relabeled as Node 26 evidence.
Five-framework server diagnostics publish Node and Bun populations separately. All five Bun
participants use native `Bun.serve`: eXact's Bun adapter, React's streaming renderer, the
SvelteKit 2 Bun adapter, and Nitro's Bun preset for Nuxt and TanStack Start. Separate production
builds pass the shared browser contracts before measurement. Historical Bun compatibility captures
retain their original transport identity. Bun retained heap covers JavaScriptCore and Node retained heap covers V8, so their
absolute heap measurements are not equivalent engine accounting. Browser charts retain their
independent Chromium capture provenance when only server runtimes change.

### Scheduled-demand isolation

Use `measure:ssr:arrivals` for published arrival-rate comparisons. Each framework/rate case gets
fresh worker, service, and driver processes, 30 seconds of target-rate warmup, and at least
60 seconds of measurement. Reverse framework and rate order in the second population. Preserve
warmup failures and demand misses. The p99 range spans driver/population percentiles and excludes
unsent demand; it is not a confidence interval. See [the load protocol](../docs/ssr-load-testing.md).
