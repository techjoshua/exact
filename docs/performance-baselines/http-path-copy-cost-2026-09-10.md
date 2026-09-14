# Paired pathname-copy diagnostics

Status: representation effect reproduced; repeatable net HTTP improvement not
established. Production path handling and serializer remain unchanged.

## Paired encoding trace

The earlier literal-path substitution used separate workers. This capture instead
toggles a UTF-8 Buffer round trip inside the same worker's renderParticipant wrapper:
Buffer.from(path, 'utf8').toString('utf8'). Its cost is inside the measured rendering
interval. Original data, tree, hydration and response work remain. A standalone V8
layout check verifies the fixture pathname changes from sliced to sequential
one-byte representation without changing its value.

Two production Node 26.8.1 workers warm for ten seconds, then alternate four
three-second blocks in copied/original/original/copied and reversed order. Two
fresh drivers use concurrency 16 each per block. The prior one-in-64 synchronous
region tracing and ordinary benchmark telemetry remain. All processes run below
normal priority. PC workload may vary.

| Worker | Original JSON us | Copied JSON us | Original RPS | Copied RPS |
| --- | ---: | ---: | ---: | ---: |
| First | 4.30 | 2.75 | 9,377 | 9,386 |
| Second | 4.33 | 2.76 | 9,221 | 9,272 |

Total measured render time, including copying, decreases approximately 0.62
microseconds in each worker. The JSON-region decrease is approximately 1.55 to
1.58 microseconds. The larger substep improvement therefore does not translate
directly into an equivalent rendering or throughput improvement. Instrumentation
and other execution effects prevent assigning the entire difference to copy cost.
All 223,914 measured responses are valid with zero errors.

## Net-cost follow-up without region tracing

A second worker retains ordinary benchmark telemetry and the existing outer
invocation timer, but removes the region wrappers and sampling. It loads the
canonical retained artifact. Three modes compare no copy, UTF-8 Buffer round trip,
and Latin-1 Buffer round trip. The latter is a diagnostic for this ASCII HTTP
pathname, not a generally valid transformation of arbitrary Unicode strings.

Each of two fresh workers has ten seconds of warmup and six three-second blocks:
none/UTF-8/Latin-1/Latin-1/UTF-8/none and the reverse. Copying remains inside the
render interval. Full response identity is verified in every mode.

| Worker | No copy RPS | UTF-8 copy RPS | Latin-1 copy RPS |
| --- | ---: | ---: | ---: |
| First | 9,242 | 9,714 | 9,715 |
| Second | 9,738 | 9,447 | 9,591 |

The first worker favors copying, while the second does not. There is no repeatable
net gain established by these observations. All 345,393 measured responses are
valid with zero errors. These are diagnostic Node eXact string runs, not React or
Bun comparisons and not a replacement public baseline.

## Decision

The pathname's representation affects measured encoding time, but introducing an
extra per-request conversion is not yet justified by total throughput. Keep normal
path handling. This is not rejection based on a minimum gain threshold; the net
effect changes direction, and the change adds allocations and platform-specific
work. A source-level change would also need correct ownership at the request or
serialization boundary rather than a benchmark-only path rewrite.

The adjacent archive contains 18 verified files covering both builders, workers,
runners, raw captures, summaries, layout log, fixture and original artifacts. Hashes
and response validation assertions were checked. All owned processes exited; only
the user's Codex Node remained. No production code, public docs, package acceptance
or browser behavior change is claimed.
