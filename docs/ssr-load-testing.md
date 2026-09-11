# Sustained SSR load testing

The opt-in sustained-load runner adds independent load generation and demand accounting to the
framework comparison. It complements the existing short-window capacity profile; the protocols have
different load histories and instrumentation, so their absolute RPS values are not interchangeable.

Private worker telemetry uses a persistent HTTP connection with a bounded deadline. It is outside
application load accounting and must not open a new connection for every sample while the listener
is saturated. Missing telemetry still rejects public capacity publication. Preserve a rejected
capture and document any repeated measurement; do not erase application request failures.

## Running a local comparison

Run the shared browser correctness suite before measuring an implementation. The load command consumes
existing production builds and does not build packages or automatically update public performance charts:

```sh
npm run test:e2e --workspace @exactjs/framework-comparison-suite
npm run measure:ssr:load --workspace @exactjs/framework-comparison-suite -- load-plans/ssr.json results/ssr-load.json
```

The example plan names current eXact and React. Add a participant such as
`{"id":"old","participantId":"exact","serverEntry":".tmp/frozen/server.mjs"}` to measure a frozen
eXact artifact alongside them. Participant artifact paths are repository-relative; CLI plan and output
paths are relative to the invoking working directory. The current implementation supports the eXact
and React controlled-service fixtures on Node. It is not a native-full-stack or Bun comparison.

Set top-level `"preloaded": true` to reuse decoded fixture data and bypass per-request data-service
fetching. The default is `false`. This diagnostic measures the remaining render/response path;
it is not representative of an application that fetches data on every request. Compare it separately
from normal loading, and verify driver CPU and scheduling lag before calling a throughput plateau
the framework's ceiling. The same option applies to all participants in a plan.

The Node string lane awaits the complete component-rendered document. eXact hands that string to
a buffered response and its Node adapter; React ends its response with the completed string.
Streaming uses Web Streams in both frameworks. eXact consumes through its Node adapter, while
React uses Node's `Readable.fromWeb()` and `pipeline()` bridge. HTTP throughput therefore includes
these transport choices. Use a shared-transport diagnostic to distinguish renderer cost from
adapter cost; the [sink investigation](performance-baselines/ssr-sinks-2026-09-09.md) records both.

Each population starts a fresh controlled-service process and one fresh worker per participant.
One independently owned driver runs each participant's complete plan, while other workers remain
resident. Adjacent populations reverse block order; subsequent pairs rotate it. Each driver performs
an untimed status/content/response-identity check before admission. Target entry files and shared
server/adapter build identities are checked before and after the complete run.

The default plan discards 60 seconds of warmup, measures 120 seconds at concurrency 32, then uses
15-second linear ramps and 120-second arrival-rate stages. Rates in the example are starting points,
not a universal capacity target. Pilot below and above the expected operating range before freezing
a comparison plan. Do not select different offered rates for different frameworks in a comparison.

## Load and overload accounting

- **Concurrency:** each of the configured request loops replaces a completed request until the
  admission deadline. Its offered load naturally decreases if responses slow down.
- **Arrival:** deterministic request timestamps come from the integral of the configured rate,
  including linear ramps. Arrival scheduling never waits for a previous response. Scheduling lag is
  measured against the intended timestamp, and response latency is reported both from dispatch and
  from that intended timestamp.
- **Bounded overload:** the driver permits at most `maxInFlight` active requests, without an unbounded
  request queue. It counts capacity misses, arrivals overdue by more than `maxLagMs`, and arrivals left
  undispatched when the admission deadline passes. It does not release an unlimited catch-up burst.
- **Drain:** admitted requests finish or reach their absolute request deadline. They remain part of
  completed-request accounting. Reports distinguish admission duration, final drain, completed RPS over
  total elapsed time, and completions during admission.

For every completed stage:

```text
offered = started + missedLag + missedCapacity + missedDeadline
started = completed
completed = valid + errors
```

`invalid` and `timeouts` are subsets of errors, not additional completions. Missed arrivals have no
response latency; always read latency distributions together with missed/error counts. Otherwise a
generator or server that cannot meet demand can appear to have deceptively good latency.

Every received response is status-, byte-count-, and hash-validated against preflight. TanStack-specific
normalization in the shared hash helper does not broaden the local runner's supported participants.
Validation follows the response completion timestamp but consumes measured driver CPU and can affect
later scheduling. Response bodies have a configurable byte limit; request deadlines cover connection
and response duration, including a peer that keeps sending without completing.

## Time series and attribution

The driver retains bounded native histograms, counters, and one summary per actual reporting interval,
not one object per request for an entire stage. Histograms use microsecond units and three significant
figures; they are approximate distributions. Each interval records actual elapsed time, counts,
in-flight work, latency and scheduling-lag distributions, validation time, CPU, memory, GC, and event-loop
utilization/delay. Delayed timer ticks are visible rather than treated as exactly one second.

Load-mode workers replace unbounded request arrays with cumulative phase count/sum/min/max counters.
The coordinator samples these once per second. Difference count and sum between samples to calculate
interval phase means. Data loading includes fetch and decoding; eXact's render phase includes its
produced-response adapter path. Phase scopes differ between frameworks and are not a shared pure-render
microbenchmark. Per-request CPU spans overlap at concurrency; use differences of process CPU totals
for CPU-per-request attribution instead of adding those overlapping spans.

The controlled service independently reports CPU, memory, GC, and event-loop measurements. Driver,
service, and worker identities and timestamps permit correlation without sharing their event loops.
High driver CPU or scheduling lag, saturated service CPU, and growing worker data-load time are distinct
observations. They do not automatically establish which framework renderer is faster.

Warmup/ramp stages carry `discard: true` and remain archived for diagnosis. Stage percentiles cannot be
averaged to create a pooled percentile. Keep population results and time series; aggregate capacity by
total completed requests divided by total elapsed time. A single high-throughput interval or a single
process population does not establish a consistent lead.

## Independent or remote driver

The same driver can run without the local coordinator:

```sh
node framework-comparison/src/ssr-load-process.mjs driver driver-plan.json driver-result.json
```

A driver plan contains `url`, optional `contains` and `expectedIdentity`, and the `stages` and overload
settings from the comparison plan's `driver` object. Run it on another machine against an accessible
test-server URL to remove shared driver/server CPU contention. The driver does not start or expose a
remote server or its private control endpoints. Collect remote server/service telemetry separately.

Local process separation still shares physical CPU, memory, and networking on the workstation.

Phase names are not necessarily equivalent across transport paths. In the current Node worker,
eXact's produced-response `renderMs` includes writing the response, while React's `renderMs` ends
before document assembly and response writing. Do not compare those values as isolated renderer
costs. Use complete request measurements or scoped profiles with explicit boundaries; keep profiler
overhead and per-request benchmark telemetry separate from framework attribution. See the
[paired CPU investigation](performance-baselines/ssr-paired-profile-2026-09-08.md).

The coordinator selects each entry explicitly, including default builds, so an inherited eXact
entry override cannot silently replace the artifact being measured. Child processes start without
coordinator-only Node execution flags.

Longer runs and interleaving do not remove host interference. All subprocesses use explicit ownership,
graceful shutdown, and bounded cleanup; interrupted or failed runs must not be treated as complete.

## Validation

`test/ssr-load.test.mjs` covers scheduled demand/ramp mathematics, overloaded admission, injected driver
stalls, response integrity, absolute timeouts, cancellation, bounded counters, and child-process cleanup.
These tests load source helpers without generated package outputs. Production runs additionally check
real fixture response identities and artifact stability. The existing short-window report publisher
does not accept this diagnostic's distinct schema.

## Public capacity publication

The Performance page consumes `apps/docs/src/data/ssr-capacity-report.json` separately from the older
browser, response-time, payload, and retention report. Its RPS summary and concurrency curve use
preloaded data and explicitly say so; normal data-loading throughput and independently scheduled
arrivals have separate tables. The old short-window RPS summary and curve are no longer displayed.

The admitted two-driver experiment archives can be summarized with:

```sh
node framework-comparison/src/publish-ssr-capacity.mjs docs/performance-baselines/ssr-followthrough-capacity-2026-09-07.json docs/performance-baselines/ssr-followthrough-2026-09-07.json apps/docs/src/data/ssr-capacity-report.json
```

The publisher requires complete captures, matching target and shared runtime artifacts, distinct
drivers, two populations, response identity, and reconciled request accounting. Concurrency captures
must be error-free. Scheduled-arrival captures may contain request errors, which are published as
counts and percentages of completed attempts; valid RPS excludes errors. Arrival capacity misses
are not admitted requests and remain separate. The driver retains `errorDetails` at stage and
interval boundaries: aggregate codes, up to 32 sample failures, and omitted-sample counts. Samples
include timestamps, stage offsets, request/response phase, bounded messages, socket reuse and
available port information. Timeout, response-size, HTTP-status and identity failures have distinct
codes; response bodies are never retained in error samples. At most 32 distinct codes plus an
overflow bucket are retained. Historical captures without this field cannot recover error codes.
Worker telemetry also retains bounded handler and accepted-socket failures, with sampled stderr
logging. A transport failure before server acceptance may exist only in driver evidence. It sums
valid responses over the union of simultaneous driver stage spans and retains percentile ranges.
It does not infer a pooled p99 or turn a preloaded result into normal-loading application throughput.
The multi-driver orchestrator and exact plans are preserved in the experiment archives; the ordinary
`measure:ssr:load` coordinator still uses one driver per participant block.

## Native Bun captures

The Bun lane uses native production handlers for all five controlled-service participants. React uses
its Bun streaming renderer; SvelteKit 2 uses `svelte-adapter-bun`; Nuxt and TanStack Start use Nitro's
`bun` preset. See the [suite workflow](../framework-comparison/README.md#native-bun-production-targets)
for separate builds and the shared browser correctness checks.

Sustained eXact/React capacity captures record `runtimeId: "bun"`, both `bun-fetch` transport identities,
and the Bun adapter artifact hash. The publisher rejects a mixture of Node and Bun target evidence.
Node load drivers measure complete HTTP response bodies from the native listener, including streamed
output. Worker-local Fetch timings end when the handler returns its Response; they are phase diagnostics
and must not replace the driver's response-completion timings.

The docs page reads `ssr-bun-capacity-report.json` beside the independent Node capacity report.
Bun-only latency, retention, and response-size refreshes preserve Node and browser capture provenance:

```sh
node scripts/component-local-target-abi/refresh-docs-ssr-report.mjs apps/docs/src/data/performance-report.json <bun-raw.json> apps/docs/src/data/performance-report.json --diagnostics-only --runtime=bun
```

The new native capture supersedes the earlier Bun compatibility capture in public charts. Historical
raw evidence keeps its original transport labels and is not combined with native populations.
