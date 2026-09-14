# Node HTTP profile of structural composition

Status: diagnostic counter-result. This profile does not explain the large
unprofiled Node throughput difference. No production source changed.

## Capture

The matched control, detail-only, and combined artifacts from the
[factorial comparison](structural-factorial-2026-09-10.md) run in fresh Node
26.8.1 production workers. One population uses control/detail/combined order;
the second reverses it. All processes run below normal priority. Each worker
warms for ten seconds at total concurrency 32, then receives ten seconds at
3,000 offered requests/s from two drivers while the Node inspector CPU profiler
is enabled. The requested sampling interval is 250 microseconds. No builds,
tests, or other benchmark workers run concurrently; user PC workload may vary.

Every completed response matches its expected full 4,672-byte document hash.
There are 179,970 valid measured responses, zero response errors, and 30
driver scheduling misses. Misses are not failed server responses. Artifact
hashes, server package outputs, and adapter outputs are checked after capture.
All owned processes close; process inspection finds only the user's Codex Node.

This differs from the successful unprofiled concurrency benchmark in both
profiler state and offered-load policy. It is not a maximum-throughput test.

## Timing and GC

Pooled means, microseconds per request:

| Metric | Matched control | Detail only | Combined |
| --- | ---: | ---: | ---: |
| Render interval | 81.57 | 79.53 | 80.38 |
| Entry to first write | 93.15 | 90.05 | 91.35 |
| Participant completion | 135.64 | 133.03 | 133.70 |
| Process CPU | 212.34 | 203.93 | 212.76 |
| Observed GC duration | 3.37 | 3.35 | 3.23 |

Intervals overlap and include scheduling effects. Process CPU includes helper
threads and profiler/control overhead. GC event duration is not GC CPU time.
These columns must not be added as independent stages. Phase counters include
the few associated control requests, as in the preceding HTTP profile method.

The combined candidate is only about 1.45% lower in render elapsed time than
control here. Its process CPU does not improve, and detail-only has the lowest
profiled means. The earlier combined RPS advantage is therefore absent from
these measurements. This does not invalidate the earlier response counts; it
limits what this different workload can explain about them.

## Stack attribution

Nearest recognized source operation determines each sample's group. Counts are
normalized per 10,000 valid requests. New `audit*` helper frames are classified
explicitly so their work cannot disappear into an unreported bucket.

| Sample group | Matched control | Detail only | Combined |
| --- | ---: | ---: | ---: |
| Generic program/traversal | 481.2 | 456.4 | 272.3 |
| Composition helpers | 0.0 | 34.5 | 178.7 |
| Program/traversal plus composition | 481.2 | 490.9 | 451.0 |
| Component preparation/ownership | 261.1 | 230.3 | 245.5 |
| Application/asset preparation | 249.4 | 202.5 | 262.7 |
| Hydration | 296.0 | 295.8 | 293.7 |
| Result assembly | 168.4 | 178.2 | 165.8 |
| HTTP input | 327.8 | 320.2 | 328.3 |
| HTTP output | 674.3 | 716.7 | 680.9 |
| GC | 77.9 | 76.2 | 74.8 |

Reporting only the generic traversal reduction would exaggerate the result.
Including the replacement helpers leaves about 6.3% fewer samples in that
combined group, not the roughly 43% suggested by the generic row alone.
Sampling, inlining, and source precedence affect classification. These are
neither exact CPU budgets nor removable-cost estimates.

Hydration and result assembly remain close. The combined candidate's
`serializeJson` self samples are about 172 per 10,000 responses versus 165 in
control. No serialization or allocation explanation for the large prior gain
is established. Top self sites come from each profile's retained top-site list,
not a complete heap or allocation census.

## Decision

Keep the unprofiled gain as evidence worth investigating, but do not attribute it
to a mechanism this profile does not reproduce. The next diagnostic should
separate offered-load policy from profiler effects: compare saturated concurrency
with and without profiling under matched worker conditions. Profiled fixed-rate
execution cannot be silently substituted for the workload that showed the gain.

Do not resume hydration tuning or make a JIT/GC claim merely because the current
capture failed to explain the difference. The complete prototype remains isolated,
and compiler, package, task/cancellation, browser, and four-mode acceptance remain
outstanding.

The adjacent archive preserves worker, runner, analyzers, raw captures, six CPU
profiles, summaries, logs, measured artifacts, report, and a verified SHA-256
manifest. No React rerun occurred in this diagnostic.
