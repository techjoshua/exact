# Reversed warmup for identical SSR replicas

Status: warmup order remains a plausible contributor to worker differences, but
this capture does not establish causality. No production code changed.

## Hypothesis and control

The last-started, last-warmed worker was repeatedly fastest in earlier captures,
including identical replicas. This experiment holds startup order A, B, C, D
constant and reverses warmup to D, C, B, A. If warmup position explains the
dominant effect, the fastest worker should move toward A. There is no predicted
framework speedup: the four replicas execute identical code.

The runner derives from the equal-count control. It retains the original worker,
combined structural artifact, scratch count-limited warmup driver, production
Node 26.8.1, below-normal process priorities, complete document validation, and
eight balanced 1.5-second measurement blocks. Each worker receives exactly
100,000 validated warmup requests through two drivers with concurrency 16 each.
Only warmup order and output paths change. Startup identity preflights remain in
A through D order. Each measured block uses fresh drivers, as before.

## Results

| Replica | Previous A-to-D warmup mean RPS | Reversed D-to-A warmup mean RPS | Reversed-run block wins |
| --- | ---: | ---: | ---: |
| A | 8,005 | 8,813 | 4/8 |
| B | 8,242 | 8,161 | 2/8 |
| C | 7,747 | 7,556 | 0/8 |
| D | 10,276 | 8,095 | 2/8 |

The prior column comes from `structural-count-warmup-2026-09-10.md`. These are
different worker populations and wall-clock periods. Differences between columns
must not be attributed solely to warmup order or treated as implementation gains.

The reversed run completed 392,594 valid measured responses with zero errors,
excluding 400,000 warmup requests and identity preflights. Artifact and worker
hashes match the recorded rows. All owned processes closed; the remaining Node
process belongs to the user's Codex session.

The last-warmed replica A now has the highest mean, consistent with the hypothesis.
However, A wins only four of eight blocks, versus D's eight wins in the preceding
run. A ranges from 7,315 to 9,973 RPS. The highest replica mean remains 16.6%
above the lowest despite identical implementations. Neither startup position nor
warmup position is established as a deterministic explanation.

## Consequences for optimization work

The combined prototype's earlier positive Node result remains unaccepted. Its
reduction from 21 generic child-output groups to seven is verified structural
work reduction, but its throughput benefit is not established. Profiling also
showed replacement helper costs, so eliminated dispatch counts alone cannot
justify compiler integration.

Further implementation comparisons must balance worker startup and warmup as well
as measured order, with independent process replicas per variant. A useful next
control is to warm each worker immediately before its measured block, rotating
which replica receives that treatment first. That removes the long unequal idle
interval following one-time warmup. Use identical replicas to verify the protocol
before relying on it to distinguish the retained renderer from the prototype.
This is a control hypothesis, not a claimed fix for benchmark variability.

The adjacent evidence archive contains the runner, log, raw blocks, warmup results,
summary, reused count-limited driver/process owner, measured artifact and original
worker, and a verified SHA-256 manifest. No React comparison or browser/package
acceptance occurred in this diagnostic.
