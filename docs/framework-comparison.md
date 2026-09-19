# Framework comparison suite

The repository's [`framework-comparison`](../framework-comparison) directory defines a reproducible,
production-shaped application comparison for eXact and other web frameworks. Its application contract,
deterministic fixture and service, scenario catalog, fairness methodology, production SSR applications,
black-box acceptance suites, and measurement harness are implemented. The controlled track includes eXact,
React, SvelteKit, Nuxt, and TanStack Start. The native track includes eXact compiler server tasks and React
Router loaders and actions. Correctness-gated results from the current controlled comparison are published
in the documentation's Performance page.

The current [final WSL workspace capture](performance-baselines/wsl-optimized-final-2026-09-19.md)
repeats the full comparison matrix after the SSR hydration-slot optimization, with verified workspace
dependencies. It compares eXact/React RPS ratios against the corrected pre-optimization workspace
capture, including the remaining regressions, and distinguishes the earlier published-package installation.

The public server capacity charts use independent-driver sustained captures for eXact and React,
with preloaded rendering/response capacity, normal data-loading throughput, and scheduled arrivals
labeled separately. Aggregate RPS divides valid responses by elapsed time, including drain. The
earlier v2 short-window RPS presentation is superseded; its historical reports remain available.
Other frameworks have not yet been admitted under the new protocol. Response-time, payload, and
memory charts use separately dated diagnostic captures, with per-lane sample counts. See the [load guide](ssr-load-testing.md)
and [methodology](../framework-comparison/methodology.md) for measurement limits.

The eXact browser build explicitly selects the hydrating component-contract projection: it preserves the
same SSR adoption behavior while leaving analysis-only component inventories out of the shipped bundle.

## What the suite compares

The application is an incident-operations console with server-renderable queues, deep-linked details,
optimistic claims, stale-version conflicts, validated comments, asynchronous server analysis, and live updates.
Every participant must produce equivalent visible and accessible outcomes while retaining framework-native
component, routing, state, cache, rendering, and server-invocation choices.

Two tracks prevent architectural and rendering questions from being conflated:

- **Controlled service** participants use the same Fetch-compatible JSON and server-sent event service. This
  track emphasizes browser delivery, startup, rendering, updates, and interaction behavior.
- **Native full stack** participants use the framework's preferred server actions, loaders, RPC, streaming, and
  cache model while preserving the same domain and user-experience contract.

Results from different tracks are never placed in the same ranking.

## Current commands

```sh
npm run check:framework-comparison
npm run test:framework-comparison
npm run start:framework-comparison-service
npm run build -w @exactjs/framework-comparison-suite
npm run test:e2e -w @exactjs/framework-comparison-suite
npm run test:native -w @exactjs/framework-comparison-suite
npm run measure:development -w @exactjs/framework-comparison-suite
npm run measure:native:development -w @exactjs/framework-comparison-suite
```

The service defaults to `http://127.0.0.1:4310`. The suite check validates fixture identity and ownership,
scenario references, declared metrics, and participant metadata. Focused tests protect optimistic concurrency,
mutation versioning, input validation, asynchronous job progression, and benchmark-only reset authorization.
The controlled browser suite runs 35 checks across five participants, covering SSR/hydration, filters,
optimistic claims and conflicts, comments, analysis progress, live updates, focus preservation, empty data,
recoverable failures, keyboard use, and event reconnect. A separate eight-check native suite protects SSR,
framework-owned mutations, asynchronous analysis, and cross-session focus preservation without mixing
track results.

The Nuxt Node build uses Nitro's `node-listener` preset. Both browser acceptance and SSR workers
import its public `listener` export and own the HTTP server lifecycle. The harness does not depend
on generated chunk paths or minified internal exports. Bun retains its native `bun` preset.

## Measurement policy

Correctness gates every timed scenario. Runs retain raw samples, environment and dependency metadata, exact
participant revisions, and limitations. Performance remains a vector of browser, server, build, delivery, and
memory measurements; codebase complexity remains a separate profile of authored code, dependencies, boundary
plumbing, error paths, and standardized change effort. The suite does not calculate a synthetic overall
winner. Correctness, complete raw populations, artifact identity, and environment metadata gate publication.
Timing and normalization warnings remain visible evidence for interpretation rather than silently discarding
a completed run.

Controlled browser, startup CPU, and comparable SSR timing results use balanced round interleaving: each round
collects one sample or window from every framework, rotates their order positions, and reverses alternating
rotation cycles. Exact orders are retained in raw evidence so host drift and user activity are auditable instead
of being silently assigned to whichever framework ran last. SSR cold startup, retention, response decomposition,
and intrusive CPU/allocation profiles remain isolated so their process ownership stays meaningful. An admitted
historical eXact server artifact can also run in the same rounds for a direct before/current comparison.

SSR measurement clients bound idle connection pooling with a finite agent timeout, allowing Node
to retire free sockets before a shorter advertised server keep-alive timeout. The sustained driver
uses its configured request deadline; the burst client uses ten seconds. Requests retain their
existing deadlines and failures are not retried. Transport errors remain distinct from invalid
responses and missed arrivals. Captures made before this pooling correction retain their original
connection policy and error counts.

For steady-state offered-load investigations, prepare the intended connection population gradually
immediately before the measured stage and retain setup errors separately. A low-concurrency warmup
can leave a larger pool idle long enough to expire. Abrupt pool expansion under overload is a
different transport workload and should remain an explicit control rather than being silently
replaced with prepared connections. See the
[connection investigation](performance-baselines/ssr-followup-2026-09-12.md) for the measured distinction.

Controlled browser results use captured production pages over real HTTP, with framework servers stopped.
Each sample uses a fresh cache-disabled context in a warm browser process, after one discarded scenario per participant.
Actions and live updates still use the shared service. `COMPARISON_CLIENT_MODE=live` retains a separate
full-application measurement; live and replay results must not be merged. The [methodology](../framework-comparison/methodology.md#captured-page-client-measurements)
documents capture identity, framing, cache policy, and publication checks.
Interaction latency is measured from the browser's captured click to the corresponding visible DOM mutation;
automation actionability waits and assertion polling are therefore excluded, while interaction-triggered
hydration remains included.

Controlled FCP samples use the standard paint entry `startTime`. Measured documents navigate directly from
Chromium to the common HTTP replay server, without browser interception; live mode instead uses each participant server. The
suite does not collect Chromium's experimental render-completion or frame-presentation timestamps.

Heap samples are taken after semantic readiness, one rendering opportunity, and explicit garbage collection.
They are labeled as post-GC retained heap so ordinary allocation and collection timing is not mistaken for
cross-sample growth. Dedicated repeated-lifecycle profiling is still required to diagnose an actual leak.

The separate `measure:heap` lane captures unprofiled snapshots after an incident claim settles. One
discarded warmup round precedes five balanced interleaved rounds by default. Every sample uses a fresh,
cache-disabled browser context. Raw evidence retains browser version, build hashes, sample order,
post-GC memory counters, and snapshot self-bytes by node type. The docs heap chart is independently
published from this evidence with `scripts/component-local-target-abi/publish-docs-heap-report.mjs`.
It has its own capture date and does not replace the timing report.

The chart uses arithmetic means so category segments add to the mean total. `code` nodes are V8 code
and metadata; `hidden` and `object shape` nodes are a separate internal/shape category. Objects,
arrays, closures and regexps, strings (including source text), native nodes, and remaining node types
complete the partition. These categories describe node representation, not application ownership.
Unknown future types remain in Other. Sum self-bytes once per node, never overlapping dominator
retained sizes. Snapshot self-bytes include native nodes and must not be rescaled or subtracted from
the separately captured `JSHeapUsedSize` metric. The totals do not represent whole-browser memory.

The normative fairness and reporting rules live in
[`framework-comparison/methodology.md`](../framework-comparison/methodology.md). The detailed experience and
domain invariants live in
[`framework-comparison/specification/application.md`](../framework-comparison/specification/application.md).

## Workspace dependency provenance

The comparison must resolve every eXact compiler, runtime, and adapter dependency to its owning
workspace directory from both the harness and participant locations. Builds, browser harnesses,
and SSR workers reject nested registry copies, even when their package version matches. SSR
environment metadata records those resolved paths and versions. Private comparison manifests
participate in repository version planning so incompatible framework releases update their ranges.

The September 18 WSL capture accidentally loaded published 0.5.1 packages after the workspace
versions advanced. Its source snapshot and root-level adapter hashes did not prove runtime
provenance. It is retained as historical data, not evidence of this branch's performance.
