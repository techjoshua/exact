# Identical Node worker replicas

Status: diagnostic evidence of substantial variation without an implementation
change. The structural composition prototype remains unaccepted.

Four independent Node 26.8.1 production workers load exactly the same combined
artifact through exactly the same original benchmark worker. Per-row SHA-256
values confirm one artifact identity and one worker identity across all replicas.
Each gets ten seconds of warmup, followed by eight balanced 1.5-second blocks.
Two fresh drivers use concurrency 16 each. Only one replica receives load at a
time. All owned processes run below normal priority. No profiler, tests, or builds
run concurrently; the PC remains available for user work.

All full authored response texts match before timing, and every measured response
matches its expected complete byte/hash identity. The run has 32 blocks, 417,249
valid responses, and zero errors. All owned processes close; process inspection
shows only the user's existing Codex Node process.

| Identical replica | Mean requests/s | Lowest block | Highest block |
| ----------------- | --------------: | -----------: | ------------: |
| A                 |           7,574 |        6,235 |         8,756 |
| B                 |           9,226 |        7,327 |         9,913 |
| C                 |           7,788 |        6,860 |         8,955 |
| D                 |          10,091 |        9,430 |        10,399 |

The fastest replica's mean is about 33.2% above the slowest. Replica D exceeds
A and C in every paired block, despite identical code and worker configuration.
This shows that consistent block wins within one pair of processes are insufficient
to assign an implementation effect of the size seen in the preceding experiments.
It does not identify the cause as CPU placement, JIT, GC, or external machine load.

Repeated blocks measure each existing process, not independent startup populations.
Equal warmup duration also does not imply equal numbers of completed warmup renders.
Both limitations matter when comparing results. No observation is discarded, and
these data do not define a universal noise band for every benchmark.

## Consequence for the investigation

The prior 17.9-27.7% combined gains cannot currently establish a causal optimization
win: identical replicas can differ by that much under the same test policy.
Likewise, the contradictory negative captures do not prove the composition is
intrinsically slower. Worker-source differences are not necessary to produce a
large persistent difference. The original-versus-diagnostic capture therefore
cannot establish an inspector-import or worker-code mechanism.

Stop selecting renderer changes by more blocks on a single process pair. Use
independent startup replicas for an implementation comparison and report variation
across those replicas. Before another performance rewrite, a bounded follow-up can
check whether additional equal-count HTTP warmup narrows the identical-replica
spread. Do not substitute tight in-process render-loop warmup for actual HTTP
execution, given the earlier context diagnostics.

The measured construction/traversal reduction remains valid structural evidence,
but neither a general compiler change nor a throughput improvement has been
accepted. No React rerun or production source change occurs here. The overall
performance objective remains unmet.

The adjacent archive preserves runner, raw rows, summary, log, artifact, original
worker, report, and a verified SHA-256 manifest. All measured identity hashes are
checked again when archived.
