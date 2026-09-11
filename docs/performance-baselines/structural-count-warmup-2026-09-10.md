# Equal-count HTTP warmup for identical replicas

Status: equal warmup request counts do not eliminate the observed replica spread.
No production source changed and no optimization was accepted.

Four fresh Node 26.8.1 production workers use the same combined artifact and
original benchmark worker. Instead of ten-second warmup, each completes exactly
100,000 validated HTTP load requests. Two drivers each stop admitting warmup work
at 50,000 requests, with concurrency 16 and a 60-second safety deadline. The
runner asserts the exact successful count before proceeding. Each driver also
performs its normal identity preflight, equally for every replica.

The count condition exists only in a scratch copy of the load driver and only
for the named warmup stage. Measured blocks retain duration-based admission.
The cloned process and owner preserve IPC shutdown and parent lifecycle handling.
Warmup fields normalized against the safety duration are not performance results.

Eight balanced 1.5-second measurement orderings follow. All processes run below
normal priority, one loaded replica at a time, without profiling, tests, or builds.
User PC workload may vary. Complete output identities match throughout.

| Identical replica | Valid warmup requests | Mean measured RPS |
| --- | ---: | ---: |
| A | 100,000 | 8,005 |
| B | 100,000 | 8,242 |
| C | 100,000 | 7,747 |
| D | 100,000 | 10,276 |

The measured run has 412,389 valid responses and zero errors, excluding the
400,000 warmup requests and preflights. All owned processes close; only the
user's existing Codex Node remains. Artifact and worker hashes are verified.

The highest mean is approximately 32.6% above the lowest, similar in scale to
the preceding duration-warmup replica capture. Equal counts therefore did not
resolve the problem. This is a new startup population, not a controlled estimate
of the effect of warmup policy alone.

## Ordering clue

Replica D exceeds A, B, and C in every measured block here. D was also fastest
in the preceding identical-replica capture. In both runs it was started last and
warmed last. The combined variant in the positive four-variant factorial capture
also occupied the last startup/warmup position. In the original-versus-diagnostic
worker comparison, the fast combined diagnostic worker was started and warmed
last as well.

This pattern makes startup/warmup order a concrete hypothesis. It does not prove
that order causes the difference or identify an engine/OS mechanism. Balanced
measurement order did not balance worker creation and warmup order in these runs.

The next control should hold startup order constant while reversing warmup order.
If the fast position follows warmup, investigate idle time or warmup-related
runtime state. If it does not, separately vary startup order and retain independent
replicas. Do not attribute the result to JIT or CPU placement before testing.

The earlier prototype gains remain unaccepted. No React comparison, compiler
integration, browser validation, or framework behavior change occurs here. The
adjacent archive preserves runner, cloned load driver/process/owner, warmup logs,
raw measurement rows, summary, measured artifact and worker, report, and verified
SHA-256 manifest.
