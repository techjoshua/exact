# Structural composition HTTP comparison

Status: promising Node string diagnostic, not production acceptance. The isolated
prototype has not replaced the retained framework. The React comparison goal
remains unmet.

## Hypothesis and measured change

The [detail prototype](structural-detail-2026-09-10.md) combines shell paths and
specializes structural traversal inside the shell and detail component. Its trace
reduces prepared program constructions from 22 to 15 and child-group traversals
from 21 to 7, while retaining eight component executions and 89 sink writes.
Original block writers, some capture containers, and specialized helper calls
remain. The planning hypothesis was approximately 3-6% HTTP improvement, with no
minimum percentage imposed for adoption.

This is a generated-artifact diagnostic for the benchmark's structure, not a
general compiler implementation. Earlier output, limits, capture-order, and mocked
cleanup checks do not establish arbitrary task, cancellation, enhancement, or
browser correctness. Timing it tests whether the removed work matters enough to
justify further implementation; it does not waive those requirements.

## Method

Node 26.8.1 uses its normal HTTP adapter. Bun 1.4.2 uses its native Fetch response
adapter and separate server artifact. String and stream are separate cells.
Production environment and below-normal process priority are used throughout.

For each cell, retained eXact, candidate eXact, and React have independent workers.
Each receives ten seconds of warmup. Six permutations of the three variants
determine the order of 1.5-second measured blocks. Two fresh drivers use concurrency
16 each. Only one variant receives load at a time; no profiler, build, or tests run
alongside measurement. The PC remains available for user work.

Every response must match its worker's expected complete body hash and byte count.
Before timing, both eXact variants have identical full authored documents including
the application, hydration, and four asset tags. React also renders its own complete
document. Total measured valid responses: 985,254. Errors: zero. All 72 blocks
complete. All owned workers, drivers, and services close after the run; process
inspection shows only the user's existing Codex Node process remains.

## Results

Mean RPS across six blocks, higher is better:

| Mode | Retained eXact | Candidate | React | Candidate change | Positive pairs | Median paired change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Node string | 8,555 | 10,086 | 12,571 | +17.89% | 5/6 | +14.48% |
| Node stream | 7,133 | 7,204 | 5,127 | +1.00% | 4/6 | +1.64% |
| Bun string | 10,843 | 10,853 | 11,089 | +0.09% | 3/6 | +1.01% |
| Bun stream | 8,639 | 8,489 | 8,586 | -1.74% | 3/6 | -0.41% |

Node string's paired changes are +50.01%, +26.34%, +10.89%, +11.56%, +17.40%,
and -0.59%. The first pair materially increases the mean, but unlike the earlier
frame experiment, the median also indicates a substantial positive difference.
Omitting any one block as a sensitivity calculation leaves a mean gain between
12.86% and 21.78%. This is not permission to discard observations or a confidence
interval. Machine interference and worker/runtime state can still confound results.

Node stream's small positive mean changes sign when its strongest pair is omitted.
Bun string's sensitivity also crosses zero. Neither establishes a dependable
small improvement. Bun stream has three positive and three negative pairs, but
its mean remains negative under every single-block omission, between -2.40% and
-0.68%. That downside needs investigation rather than being rounded away.

The candidate is 19.77% below React in Node string RPS, 40.53% above React in Node
streaming, 2.13% below React in Bun string, and 1.14% below React in Bun streaming
within this capture. These are not universal capacity estimates. In particular,
an earlier capture's absolute React rate is not a fixed denominator for this run.

## Interpretation and decision

This is stronger evidence for reducing structural traversal than the previous
small wrapper experiments, specifically in Node string HTTP execution. It does
not establish that each removed group contributes equally, that allocation or
GC caused the gain, or that a future generalized compiler implementation will
retain this result. The prototype combines shell and detail changes, so their
individual effects are not identified by this comparison.

Do not integrate this fixture-specific implementation or claim that all modes
improved. Preserve it and the control for a targeted follow-up that separates
the combined changes and examines Bun's streaming downside. Compare the
remaining helper/continuation work rather than assuming fewer source objects
must help both engines. Any generalized implementation still needs compiler,
package, ABI, task/cancellation, and browser acceptance.

The adjacent archive contains runner, analyzer, raw 72-block results, summary,
sensitivity results, all measured framework artifacts, log, report, and SHA-256
manifest. Artifact hashes are checked against every recorded row when archived.
Implementation and earlier behavioral evidence are preserved in the preceding
structural composition archives.
