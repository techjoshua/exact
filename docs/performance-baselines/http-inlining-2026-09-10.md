# JavaScript inlining and the HTTP rendering gap, 2026-09-10

## Hypothesis

Isolated rendering and HTTP execute under different callers. Different inlining
could change their cost even without a measured-phase deoptimization. Compare
default V8 with JavaScript inlining disabled for both eXact and React, inspecting
the HTTP-to-isolated invocation ratio rather than expecting disabling it to help.

## Method

The installed Node 26.8.1 lists --turbo-inlining and --maglev-inlining as enabled
by default. Diagnostic workers receive --no-turbo-inlining and
--no-maglev-inlining together. The worker reports process.execArgv and the runner
asserts both flags. Load drivers and the controlled service keep normal settings.
These are diagnostic flags, not production recommendations or a claim to disable
all native/builtin optimization.

Eight fresh workers cover both frameworks/settings twice, reversing framework
and setting order in the second population. Each warms HTTP for ten seconds,
then measures a five-second window with two fresh drivers at concurrency 16
each. Isolated loops before/after HTTP warm and measure 10,000 renders each.
Each worker compares its own isolated and HTTP invocation intervals. Cross-worker
RPS comparisons remain subject to workstation and worker variation.

The render timer splits synchronous function invocation from time after return
until awaited settlement. Tables below use synchronous invocation, avoiding
confusion with queueing after a render returns its promise. These are elapsed
intervals, not exclusive CPU samples. The same production artifacts, full
application documents and original response adapters are retained.

## Results

Arithmetic means across the two workers per framework/setting:

| Framework | Inlining | RPS | Isolated invocation us | HTTP invocation us | HTTP/isolated |
| --- | --- | ---: | ---: | ---: | ---: |
| exact | default | 8,286 | 22.89 | 54.43 | 2.38x |
| exact | disabled | 6,715 | 30.19 | 70.63 | 2.34x |
| react | default | 10,109 | 23.41 | 40.79 | 1.74x |
| react | disabled | 8,758 | 27.81 | 47.58 | 1.71x |

Individual invocation ratios:

| Framework | Worker | Default | Disabled |
| --- | ---: | ---: | ---: |
| exact | 1 | 2.408 | 2.348 |
| exact | 2 | 2.349 | 2.330 |
| react | 1 | 1.690 | 1.722 |
| react | 2 | 1.795 | 1.700 |

All 339,020 measured responses are valid, zero errors, excluding
warmups and preflights. The complete eXact document is 4,672 bytes and React is
3,660 bytes. Identity hashes match within each framework; flags change neither
document. Source artifacts and server/adapter inventories are checked before
and after. Owned worker/load processes close. No production source changes.

## Interpretation

Disabling inlining slows both workloads. It does not remove eXact's larger
HTTP-to-isolated ratio; that result repeats in both populations. This does not
prove identical inlining or rule out all JIT effects, but the proposed explanation
does not account for the dominant gap under this control. Do not tune production
inlining flags based on these numbers.

The dominant HTTP slowdown remains unresolved. Prior microtask deferral did not
restore isolated speed; a distinct future control could move invocation out of
the socket-read callback through an event-loop turn, while measuring queueing
separately and retaining both frameworks. That is a hypothesis, not a diagnosed
cause or an implemented optimization. Stop removing objects solely on allocation
counts, since the combined-output experiments reduced allocation and ran slower.

The adjacent archive includes scripts, worker, raw data, current participant
artifacts, summaries and verified SHA-256 inventory. Workspace dependencies are
not packaged as a standalone distribution.
