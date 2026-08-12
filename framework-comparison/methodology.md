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
population used for percentile calculation. Heap collection occurs after interaction timing so forced garbage
collection cannot turn optimistic feedback into a cold-allocation benchmark.

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
