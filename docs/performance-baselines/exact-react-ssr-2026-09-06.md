# Focused eXact / React SSR check, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The current eXact and React builds have closely matched sustained Node throughput in this focused
capture. React leads aggregate c32 throughput by 0.9% and has slightly lower mean sequential and
burst latency. This is a direct framework comparison after the retained UTF-8, response-accessor,
and context-disposal changes, not a before/after attribution of those changes.

The raw capture (local capture: `exact-react-ssr-2026-09-06.json`) includes all ordered samples, per-population and
combined summaries, environment metadata, artifact identities, response identities, and runner source.

## Method

The subsequent [matched-artifact gap audit](exact-react-gap-audit-2026-09-06.md) locates this exact
renderer and unchanged React build and compares them with current eXact. The original capture and
method below remain preserved.

Both production SSR participants were rebuilt before measurement. Four fresh process populations
each start eXact and React through the standard Node HTTP comparison worker. They use the same
controlled incident API service, and participant order rotates and reverses in balanced rounds.
These are complete SSR requests with service loading; the preloaded diagnostic is not used.

Each population includes, per framework:

- A discarded two-second c32 prime before sequential measurement.
- 50 balanced sequential rounds of ten requests: 500 requests.
- 50 balanced bursts of 16 simultaneous requests, with no replacements.
- Another discarded two-second c32 prime before capacity measurement.
- 50 balanced 500 ms sustained windows at concurrency 32.

Across populations, each framework has 2,000 sequential requests, 200 bursts, and 200 capacity windows.
Worker telemetry is reset between lanes and after primes. Aggregate RPS divides all completed
requests by total actual window time, including final drain. Response validation follows the timed
interval. Each response must retain its participant's baseline byte count, stable content hash,
and meaningful incident content; the frameworks are not required to produce identical HTML.

No builds, tests, or profilers ran alongside timing. Production artifact identities were checked
before and after measurement, including the server package and Node adapter. All checks passed.
The owned workers and controlled service were closed after the run.

## Results

| Metric                      |    eXact |    React |
| --------------------------- | -------: | -------: |
| Sustained c32 aggregate RPS |  2,427.0 |  2,448.4 |
| Sequential mean             | 0.755 ms | 0.731 ms |
| Sequential p95              | 1.185 ms | 1.115 ms |
| 16-request burst mean       | 7.587 ms | 7.313 ms |
| 16-request burst p95        | 9.394 ms | 9.406 ms |
| SSR document bytes          |    3,710 |    3,384 |

The sustained lane completed 246,364 eXact requests in 101.510 seconds and 248,586 React requests
in 101.530 seconds. React's mean sequential advantage is approximately 0.024 ms; its mean burst
advantage is approximately 0.274 ms. Burst p95 is essentially equal in this capture.

| Fresh population | eXact RPS | React RPS | React relative to eXact |
| ---------------- | --------: | --------: | ----------------------: |
| 1                |   2,420.7 |   2,437.4 |                  +0.69% |
| 2                |   2,418.7 |   2,438.3 |                  +0.81% |
| 3                |   2,426.0 |   2,482.3 |                  +2.32% |
| 4                |   2,442.6 |   2,435.5 |                  -0.29% |

React leads throughput in three populations; eXact leads narrowly in one. React has lower mean
sequential and burst latency in all four. The measurements support closely matched capacity and a
small React latency advantage for this fixture, rather than a substantial sustained-throughput gap.

## Interpretation

The older complete five-framework capture showed a 6.9% React throughput lead. This focused capture
does not repeat that margin, consistent with the earlier fresh-process duration study. Differences
between captures cannot be assigned to the recent eXact optimizations: participant population,
measurement ordering, warmup, and workstation activity also differ. A simultaneous old-eXact,
new-eXact, and React experiment would be needed for that attribution.

The controlled loader is shared benchmark code for these two participants. The fixture does not
exercise the full native request-context lifecycle or establish a throughput benefit from its new
empty-ownership cleanup path. These are local closed-loop Node results; client, service, and servers
share the workstation. They do not establish Bun performance, fixed-arrival latency, browser
performance, or a universal framework ranking.

The public five-framework charts retain their complete capture and its dates. This focused check
supplies newer eXact-versus-React SSR evidence without mixing two fresh participants into that older
five-framework population.

## Followup profiling targets

A separate renderer diagnostic (local capture: `exact-react-ssr-profile-2026-09-06.json`) ran 10,000 timing renders,
10,000 CPU-profile renders, and 1,000 allocation-profile renders per participant through the
existing `render-only` endpoint. These were single fresh workers in eXact/React order, not balanced
timing populations; use the profile to select experiments, not to replace the HTTP comparison.
Inspector sampling perturbs execution, and the endpoint has participant-specific output collection.

Sampled allocation was approximately 24.8 KB per eXact render and 68.8 KB per React render. These
are allocation estimates including collected objects, not retained heap. eXact's leading CPU sites
included output charging, positional hydration validation, JSON serialization, and text output.
Its leading allocation sites included child rendering, marker construction, compiled attributes,
and hydration publication.

Prioritize checking whether recoverable buffered boundaries can retain valid byte accounting at
commit rather than rescan completed output; the existing compiler already supplies static byte facts.
Next investigate reducing schema interpretation and temporary encoding allocations while preserving
all hydration validation. Marker and attribute assembly provide another target for reducing
intermediate strings and callbacks. These are hypotheses, not accepted optimizations. Any candidate
must preserve limits, cross-chunk Unicode accounting, rollback, hydration, and lifecycle behavior,
then be measured against unchanged eXact and React in fresh interleaved populations.
