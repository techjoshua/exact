# Immediate warmup for identical SSR replicas

Status: this warmup treatment does not resolve systematic replica differences.
No production code changed and no structural optimization was accepted.

## Hypothesis and method

Unequal idle intervals after initial warmup might explain why identical workers
show different throughput. The test adds a 1.5-second concurrency warmup before
each measured block, retaining fresh measurement drivers. If recent server
activity dominates the observed difference, replica means should converge and
the persistent winner should disappear. No framework speedup is predicted.

The runner derives from the equal-count control. Startup and initial warmup
remain A, B, C, D. All four workers execute the same combined structural artifact
through the original benchmark worker on production Node 26.8.1. Each first
completes exactly 100,000 validated warmup requests. Eight balanced measurement
orders follow, each block containing the additional 1.5-second warmup and then
the original 1.5-second measurement. Each stage uses two fresh drivers with
concurrency 16 each. This retains driver startup between warmup and measurement;
it does not test a continuous warmed driver or eliminate every idle interval.

Only one worker is loaded at a time. Processes run below normal priority, with
no concurrent build, test, or profiler. User PC workload may vary.

## Results

| Identical replica | Mean measured RPS | Block wins |
| ----------------- | ----------------: | ---------: |
| A                 |             8,366 |        0/8 |
| B                 |             8,531 |        1/8 |
| C                 |             8,915 |        0/8 |
| D                 |             9,738 |        7/8 |

Measured requests: 427,675 valid, zero errors. Additional immediate warmup:
409,885 valid, zero errors. Initial warmup: 400,000 valid. Identity preflights
are outside these stage totals. Complete documents match across all replicas;
artifact and worker hashes match every measurement row. The owner exited
successfully and process inspection found only the user's existing Codex Node.

The highest replica mean remains 16.4% above the lowest. D's persistent advantage
survives this immediate server warmup treatment. The preceding reversed-warmup
capture had a 16.6% spread, but a different process population and wall-clock
period, so that similarity is not an estimate of treatment effect. This result
does not establish a JIT, scheduling, CPU placement, or startup-order cause.

## Decision

Do not keep tuning warmup until a desirable result appears. These controls show
that one process per implementation is inadequate for attributing the structural
prototype's earlier positive Node result. Repeated blocks from that same process
do not supply independent process replication.

The next implementation comparison should include multiple fresh replicas per
variant and counterbalance startup, initial warmup, and measurement order. Report
each replica as well as pooled results. Use independent populations to check
whether an implementation difference survives process variation. This allows
work on the renderer to resume without claiming that local benchmark variability
has been solved or provisioning external infrastructure.

The prototype's smaller generic traversal remains a verified structural change,
not a proven throughput win. Its compiler integration, package/browser acceptance,
and comparison against React across all four workloads remain outstanding.

The adjacent archive preserves the runner, log, raw measurements and warmups,
summary, reused count-limited driver/process owner, measured artifact and worker,
and a verified SHA-256 manifest.
