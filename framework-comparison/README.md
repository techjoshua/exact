# Framework comparison suite

This directory owns a reproducible comparison of production-shaped web applications implemented
idiomatically in eXact and other frameworks. Every participant presents the same incident-operations
experience, receives the same deterministic data, and passes the same observable behavior tests.
Presentation code, routing, state ownership, and client/server integration remain participant-owned.

The application contract, deterministic service, fixture, scenario catalog, methodology, measurement
harness, five controlled-service participants, and two native-full-stack participants are implemented. All
seven applications use production SSR and hydration and pass their track's black-box acceptance suite.
Correctness, evidence completeness, artifact identity, and environment metadata determine whether a
measurement may be published. There is no separate subjective approval gate.

The eXact controlled participant declares `renderMode: 'hydrate'` in its Vite build. This retains the
resumption contract required by the shared SSR/hydration experience while excluding compiler analysis
inventories that no browser execution path consumes.

## Comparison tracks

- **Controlled service:** each UI calls the Fetch-compatible service in [`src/service.mjs`](src/service.mjs).
  This track isolates browser delivery, startup, rendering, and interaction behavior.
- **Native full stack:** each framework may use its preferred server actions, loaders, RPC, caching, and
  streaming model. It must preserve the application contract and consume an equivalent fixture.

Results from the two tracks are reported separately. A native result must never be compared as though it
used the controlled transport.

## Start here

```sh
npm run check:framework-comparison
npm run test:framework-comparison
npm run start:framework-comparison-service
npm run build -w @exactjs/framework-comparison-suite
npm run test:e2e -w @exactjs/framework-comparison-suite
npm run test:native -w @exactjs/framework-comparison-suite
npm run measure -w @exactjs/framework-comparison-suite
npm run measure:startup-cpu -w @exactjs/framework-comparison-suite
npm run measure:ssr -w @exactjs/framework-comparison-suite
npm run measure:native -w @exactjs/framework-comparison-suite
```

Collectors preserve correctness-gated raw evidence and mark a completed run publishable. Timing guards and
normalization eligibility remain diagnostics: they can warn that a comparison needs interpretation, but do
not discard an otherwise complete, reproducible measurement population.

The startup CPU profile uses a fresh cache-disabled browser context for every sample and separates
Chromium's JavaScript parse, compile, evaluation, and total script-duration signals through semantic
readiness. It runs at 1x, 4x, and 6x CPU rates by default. `COMPARISON_STARTUP_SAMPLES` selects the sample
count and `COMPARISON_CPU_RATES` accepts a comma-separated rate list.
Set `COMPARISON_HEAP_DOMINATORS=1` for the untimed diagnostic pass to report retained dominators plus
node counts and self bytes grouped by V8 heap-node type. These category totals distinguish compiled-code
metadata from ordinary objects and closures without affecting the timed sample population.

The SSR profile gives every participant an independently owned worker. Comparable workers start concurrently,
then latency and throughput samples are collected one participant at a time in balanced round-interleaved order
while all workers remain warm; cold startup, retention, response decomposition, and intrusive CPU/allocation
profiles remain isolated. Sustained throughput lanes use 50 windows by default so their published percentiles
describe a real population rather than repeating the maximum of a few samples.
The runner writes a `.timed.json` checkpoint after each completed runtime before later diagnostics can fail,
so a valid Node population is not discarded by a subsequent Bun transport error.
Each participant declares its production transport for each runtime: native integrations such as eXact's
`Bun.serve` lane are measured directly, while compatibility-only paths remain explicitly labeled. The report
includes cold startup, warm sequential and concurrent request phases, CPU per request, post-GC memory trends,
stable response identity, and target-local server-artifact sizes. `COMPARISON_SSR_SAMPLES` selects sequential
samples; the `COMPARISON_SSR_STARTUP_SAMPLES`, `COMPARISON_SSR_CONCURRENCY`,
`COMPARISON_SSR_CONCURRENCY_WAVES`, `COMPARISON_SSR_RETENTION_BATCHES`, and
`COMPARISON_SSR_RETENTION_BATCH_SIZE` variables control the other lanes. Use
`COMPARISON_SSR_RUNTIMES=node` when only Node is installed. A checkpoint may set
`COMPARISON_EXACT_BEFORE_NODE_ARTIFACT` or `COMPARISON_EXACT_BEFORE_BUN_ARTIFACT` to measure an admitted
historical eXact server entry in the same rounds instead of relying only on control-normalized history.
On Windows, Bun workers default `BUN_CONFIG_MAX_HTTP_REQUESTS` to 64, the observed reusable per-origin
connection capacity in Bun 1.3.5. This queues excess controlled-service fetches instead of consuming the
bounded Windows ephemeral-port range with one-shot sockets. An explicitly configured value remains
authoritative and the effective worker environment is recorded in the raw report.

The SSR report is written under `results/raw/`. Treat its Node and Bun rows as separate runtime
profiles, compare framework results only within the same row and benchmark run, and retain the
reported transport identity when interpreting a framework's runtime support.

### Bun-native comparison follow-up

The current Bun profile exercises eXact through its native `Bun.serve` adapter while React,
SvelteKit, Nuxt, and TanStack Start retain their Node-oriented production artifacts under Bun's `node:http`
compatibility layer. Preserve that transport identity when reporting the current results.

A future comparison update should add a separately labeled best-native-Bun lane rather than
silently changing this one. That lane should evaluate React with `Bun.serve` and its Bun streaming
renderer, SvelteKit with its Bun adapter once an accepted production release is available, and Nuxt
with Nitro's Bun preset. Its harness must measure streamed response completion consistently before
the native lane is compared across frameworks.

The service listens on `http://127.0.0.1:4310` by default. `PORT` may select another port. Its state can
be restored with `POST /__benchmark/reset` and the `x-benchmark-control: fixture-reset` header.

Read [`specification/application.md`](specification/application.md) before implementing a participant and
[`methodology.md`](methodology.md) before collecting or interpreting measurements. Participant conventions
are documented in [`participants/README.md`](participants/README.md).

## Directory ownership

```text
fixtures/       deterministic benchmark inputs
participants/   independent framework applications
results/        machine-readable runs and explanatory reports
specification/  user experience and scenario contracts
src/            controlled service and suite validation
test/           contract-level regression protection
```

Code may be shared through `fixtures`, `specification`, and domain contracts. Native participants share the
canonical domain semantics but own their server integration. Participants must not share UI components or a
client state abstraction because doing so would bias their architecture.
