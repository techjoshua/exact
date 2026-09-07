# Buffered SSR accounting experiments, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Keep the refined implementation that preserves valid byte accounting and combines marker charges.
It reduced render-plus-encoding time by approximately 4% and sampled allocation by approximately
1.1 KB per render. Complete-request throughput remains effectively flat, and the experiment does
not establish a consistent eXact throughput lead over React. The
raw evidence (local capture: `buffered-accounting-2026-09-06.json`) retains both HTTP captures, renderer screens,
allocation samples, artifact hashes, and runners.

## Ownership and correctness

The change belongs to the SSR runtime. Synchronous compiler-accounted component, child, and keyed
ranges can opt into retaining the accumulated byte ledger when a recoverable range commits. Opaque
marker callbacks keep their previous rescan. Known marker opening and closing strings are charged
together as byte-closed ASCII before rendering the body.

The sink falls back to its original restore-and-scan path when accounting provenance is invalidated
or a pending high surrogate could make late wrapping change byte counts. Encountering a trailing
high surrogate makes that decision conservative for the entire range, even after another span has
flushed it. A failed render or limit violation restores the outer checkpoint and direct-publication
state. Compiled-component ABI methods, hydration representation, and authored source are unchanged.

The first component-only prototype did not help this fixture: instrumentation found no component
commits and five child/keyed commits per render. Extending the proof to those ranges produced a small
renderer improvement, but charging the opening and closing markers separately regressed HTTP
throughput in all four populations. That version was rejected. The retained version charges their
combined byte total once.

## Method

The baseline is the current eXact production artifact before this experiment, including the prior
UTF-8, response-accessor, and empty-context cleanup changes. It is frozen independently of the
candidate. Each HTTP capture compares unchanged eXact, candidate eXact, and React simultaneously
through the normal Node comparison workers and shared controlled API service. Participant order
rotates and reverses in balanced rounds across four fresh process populations.

Per variant, each capture includes 2,000 sequential requests, 200 sixteen-request bursts, and 200
500 ms sustained c32 windows. Discarded two-second c32 primes precede sequential and capacity lanes.
Worker telemetry resets between lanes. Response validation occurs after the timed interval; every
response must retain its participant's byte count, content hash, and meaningful incident content.
The two eXact variants must also match each other. Artifact identities remained stable during runs.

The initial renderer screens time 20 balanced batches of 2,000 renders after 15,000 warm renders,
across four fresh process populations. They construct output strings but do not encode every final
string, so deferred string processing can make their gains misleading. The followup explicitly
encodes every completed document with `Buffer.from`, checks the returned byte count, and otherwise
uses the same method. This is an encoding diagnostic; HTTP remains the transport measurement.

Allocation sampling runs separately: four balanced rounds of fresh processes, each warming 15,000
renders before profiling 5,000 renders with final `Buffer.from` encoding. Sampling includes objects
collected during profiling. It estimates temporary allocations rather than retained heap. No builds,
tests, or profilers ran alongside timed benchmarks. All owned workers and services were closed.

## Refined results

| Metric                      | Unchanged eXact | Refined eXact |     React |
| --------------------------- | --------------: | ------------: | --------: |
| Sustained c32 aggregate RPS |         2,058.9 |       2,051.2 |   2,075.3 |
| Sequential mean             |        0.915 ms |      0.905 ms |  0.906 ms |
| 16-request burst mean       |        9.398 ms |      9.209 ms |  8.992 ms |
| Burst p95                   |       12.454 ms |     12.309 ms | 11.826 ms |

Refined eXact throughput changed by +0.9%, -1.3%, -0.4%, and -0.7% relative to unchanged eXact across
populations, or -0.37% overall. Sequential mean improved by 1.1%; burst mean improved by 2.0%, with
the burst improvement appearing in two of four populations. These small HTTP changes do not
establish a dependable throughput benefit. React's aggregate throughput remains about 1.2% higher
than the refined candidate in this capture.

With final encoding included, baseline renderer means across populations were 29.159, 28.661,
28.003, and 28.293 µs; refined means were 28.439, 26.736, 26.605, and 27.705 µs. All four improved,
by 2.1–6.7%, averaging 28.529 to 27.371 µs (4.1%). Sampled allocation averaged 28,733 versus
27,674 bytes per render, approximately 1,059 fewer bytes (3.7%), also improving in every round.
Those are the demonstrated benefits that justify retaining the refinement.

The refined server bundle grows by roughly 0.3% relative to the frozen baseline. The sink gains
one boolean field; this is not a claim of lower retained request-object memory or browser heap.

## Rejected first HTTP variant

The version with separate marker charges measured 2,164.1 RPS before and 2,136.3 after, down 1.3%,
with losses in all four populations. React measured 2,160.5 RPS in that same capture. Its sink-only
renderer screen had suggested a small gain, illustrating why avoiding a scan is insufficient
evidence without final encoding and complete-request measurements. Do not compare absolute RPS
between the two captures to assign an optimization effect; workstation conditions changed.

## Validation

All 220 SSR tests passed, including new tests for valid-ledger reuse, opaque/invalidated fallback,
exact output limits, checkpoint restoration, and surrogate ordering. Compiler-backed nested and
keyed Unicode fixtures check complete encoded byte counts at the exact output limit and rejection
one byte below it, with markers enabled and disabled. Frozen baseline/candidate output and byte
counts also matched for eight text variants including escaping characters, CJK, paired surrogates,
and unpaired surrogates.

The 145 server and 14 Node-adapter tests also passed (379 tests total). The SSR build,
documentation verification, JSDoc contracts, package-content checks, and whitespace checks passed.
Documentation verification reported its existing large-chunk warning.

The public five-framework charts retain their complete capture. This experiment provides a
three-way SSR comparison and focused CPU/allocation evidence, not new browser, Bun, or five-framework
measurements.
