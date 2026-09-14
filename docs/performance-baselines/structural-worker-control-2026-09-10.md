# Original versus diagnostic worker control

Status: inconclusive mechanism diagnostic. The composition prototype remains
isolated; its throughput advantage is not a dependable accepted improvement.

## Method

Four independent Node 26.8.1 production workers combine two artifacts (matched
control and combined composition) with two workers (original benchmark worker
and the profiler-toggle diagnostic worker). The diagnostic worker imports the
inspector and contains extra control routes, but no profiling route is invoked.
Neither worker enables the profiler during this run.

Each worker receives ten seconds of warmup. Eight four-variant orderings balance
measurement positions. Each measured block lasts 1.5 seconds with two fresh
drivers at concurrency 16 each. One variant receives load at a time; all owned
processes run below normal priority, with no concurrent build, test, or profile.
PC usage remains variable.

This holds the block duration and variant scheduling policy constant across
worker configurations. One process represents each configuration, however, so
worker code and process-specific runtime state are confounded. Eight blocks from
one worker are not eight independent worker populations.

All four full application-owned response texts match before timing. Every measured
response matches the expected complete byte/hash identity. There are 412,971 valid
responses, zero errors, and 32 measured blocks. Artifact and worker hashes are
recorded per row and verified when archived. All owned processes close; only the
user's preexisting Codex Node process remains.

## Results

Mean RPS, higher is better:

| Worker | Matched control | Combined | Mean candidate change | Median paired change | Positive pairs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original benchmark worker | 8,061 | 7,738 | -4.01% | -5.86% | 3/8 |
| Diagnostic worker, profiler off | 8,686 | 9,839 | +13.27% | +12.49% | 7/8 |

The combined diagnostic worker is 27.15% faster on average than the combined
original worker, with seven of eight pairs positive. Its last pair reverses
direction, at -16.71%. Control's diagnostic/original mean difference is +7.76%,
but its median paired difference is only +0.86% and four of eight pairs are
positive. All observations remain in the raw capture.

This contradicts a simple explanation that diagnostic code always suppresses
the candidate's gain. It also fails to reproduce the earlier large candidate
gain under the original worker. Neither source-level work counts nor profiler
on/off alone explains the observed ordering across captures.

## Decision

Do not tune the diagnostic worker or choose the favorable worker configuration
as a way to claim framework improvement. Do not attribute the difference to
inspector import, JIT, GC, or code layout without an independent test.

The next useful control is multiple identical replicas of the same artifact and
original worker, with independent startup populations and balanced measured
blocks. That tests whether process-specific variation can produce the apparent
configuration difference. A persistent worker-code effect would require replicated
populations for each configuration, not just more blocks on these same processes.

The prior positive and negative captures all remain evidence. The prototype is
not rejected as necessarily slower, but neither is it ready for integration as
a performance improvement. No React rerun, public API change, compiler integration,
or additional browser acceptance occurs here. The overall goal remains unmet.

The adjacent archive contains runner, raw rows, summary, log, both artifacts,
both worker sources, this report, and a verified SHA-256 manifest.
