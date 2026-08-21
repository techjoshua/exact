# Comparison methodology

## Purpose

The suite answers two different questions without conflating them:

1. How does each framework behave when only its browser-facing implementation varies?
2. What does a complete idiomatic application look and perform like when the framework owns the full stack?

The controlled-service and native-full-stack tracks answer those questions respectively. Both require the
same visible behavior, fixture semantics, authorization outcomes, conflict handling, and accessibility.

## Fairness rules

1. A participant is optimized for its own framework, not mechanically translated from another participant.
2. Shared code stops at fixtures, protocol types generated from the contract, and test utilities. UI code,
   stores, cache policies, routing, and server invocation code are not shared.
3. The same Node major version, browser build, machine, process topology, database snapshot, and network/CPU
   profile apply to every measured run in one result set.
4. Production builds are measured. Development builds may be measured separately for build and feedback
   metrics, but never mixed with runtime results.
5. A scenario must pass its correctness assertions before its timing is accepted.
6. Warm and cold measurements are labeled and reported separately. The controlled browser runner records warm
   samples after one equivalent discarded scenario per participant; run order is randomized or rotated.
7. Raw samples, environment metadata, participant commit, dependency lockfile, and harness version accompany
   every summary.
8. Framework specialists should review meaningful participants. Review corrections are recorded rather than
   silently rewriting historical results.

## Performance dimensions

The browser runner will collect navigation response time, first contentful paint, largest contentful paint,
interaction latency, long tasks, transferred and executed JavaScript, heap, and scenario settlement time.
Server runs will collect request throughput, p50/p95/p99 latency, CPU, peak memory, and cold-start behavior.
Build runs will report clean build, incremental rebuild, and emitted raw/gzip/Brotli bytes.

Scenario settlement is a semantic boundary, not merely the end of an event handler. For example, claiming an
incident settles after the server accepts or rejects the expected version and the UI displays the authoritative
owner and status. Optimistic feedback latency is recorded independently from settlement latency. Both interaction
durations use browser event and mutation timestamps, so test-driver actionability checks and polling intervals do
not become framework latency. An activation performed in response to the click remains inside the measurement.
Before dispatching the measured interaction, the harness waits for the shared `Live service` state so
SSR-visible controls cannot be clicked before a participant has hydrated and attached its client behavior.
The harness observes the existing owner and version elements rather than serializing the document body. It
records request dispatch, HTTP headers, JSON decoding, incident-stream receipt, and the two visible DOM mutations
from outside participant code. These diagnostic phases do not add callbacks, attributes, state, or scheduling
work to any participant.
Each controlled participant owns one live-service connection and routes incident and job events to its mounted
surfaces. Authoritative resources are version-deduplicated when the same update arrives through both that stream
and the mutation response.

Participants may preserve framework-native identity for unchanged resource branches. The eXact participant
retains an unchanged comments collection during owner/status merges so its fine-grained renderer does not perform
unrelated response-log work.

The controlled browser heap signal is collected after the measured interaction settles and an explicit garbage
collection. It therefore describes post-interaction, post-GC retained JavaScript heap for that page state, not
allocation churn, a process-wide footprint, or proof by itself that an application does or does not leak.

First contentful paint is read only after a buffered paint observer or a subsequent rendering opportunity confirms
that Chromium published the entry. A missing paint entry fails the sample instead of silently reducing the
population used for percentile calculation. The standard `PerformancePaintTiming.startTime` is the sole FCP
measurement. Measured document requests navigate directly from Chromium to the participant server; browser-route
interception or another harness proxy must not become part of `PerformanceNavigationTiming`. Heap collection
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
paint-critical path can be separated from later activation. Precise coverage reports emitted script extent and
invoked-function counts by chunk URL.

Trace categories can contain nested work, so parse, compile, evaluation, and total script duration are independent
signals and must not be added together. Parse and compile trace durations may also aggregate background-thread
work, while Performance-domain script duration describes main-thread wall time. CPU throttling is a repeatable
desktop-browser emulation rather than a claim about a particular mobile processor. Chunk URLs and precise
coverage provide bundle-level attribution; source-map attribution inside a chunk requires a separate sampling
profile.

## Complexity dimensions

Complexity is reported as a profile rather than one synthetic score:

- authored production and test lines, split from generated output;
- direct and transitive production dependencies;
- configuration and framework glue;
- explicit client/server boundaries and manual transport code;
- cache invalidation, rollback, cancellation, and synchronization sites;
- build and test commands;
- a blind maintainability review against a published rubric; and
- effort and code touched for the same change request across participants.

Comments, formatting, and tests must not be removed merely to improve line counts. Generated code and lockfiles
are disclosed but excluded from authored-line comparisons.

## Result interpretation

No overall winner is calculated. Results describe tradeoffs for named scenarios and environments. Differences
inside the run's noise interval are reported as indistinguishable. A result report must name limitations,
failed or skipped scenarios, framework-specific optimizations, and any contract variance.
