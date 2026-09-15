# Iterative SSR boundary dispatcher

Status: scratch experiment completed. No repeatable throughput improvement;
production implementation and canonical builds remain unchanged.

## Hypothesis and implementation

Function-entry instrumentation found 28 calls per fixture document to each of
writeProgramBoundary, renderBoundary, finishBoundary and closeBoundary. Entry
counts do not establish CPU cost, and the engine may inline these helpers.
The hypothesis was that one iterative dispatcher could save approximately
0.5 to 2 microseconds per document by reducing dispatch overhead.

The prototype replaces writeProgramBoundary in frozen current Node and Bun
artifacts with a stage loop: opening, render, returned child output, closing,
completion. Actual pending drains resume the stage through promise continuations.
Pending child work retains awaitSsrProgramSink and its settlement guarantees.
The original three downstream helpers remain in the artifact but are no longer
called by this boundary function. Compiler component execution is unchanged.
This is not a complete stack scheduler for compiled component programs.

## Validation

- 16 complete-document parity cases each on Node and Bun, including string and
  stream output, assets, changed incident content and a missing route.
- 610 Node node/depth/output-limit comparisons, all matching current behavior.
- 16 structural pressure, failure and depth-cleanup comparisons.
- 12 pending-child and flush-failure comparisons each on Node and Bun. These
  cover successful/rejected child work, synchronous/asynchronous flush failure,
  and opening/closing pressure. Failed flushes retain child settlement before
  parent completion, and failures do not emit closing spans.

These scratch checks do not constitute package/compiler/browser acceptance.
No public behavior change was adopted, so public documentation is unchanged.

## HTTP comparison

Production Node 26.8.1, string mode, full application-owned document and hydration.
Each population has four independent workers, current/candidate/candidate/current
followed by the reversed implementation assignment. Each worker receives 100,000
validated warmup requests and eight balanced 1.5-second measurement blocks.
Two fresh drivers use concurrency 16 each. Processes use below-normal priority;
no build, test or profiler runs during measurements. User PC workload may vary.

| Population           | Current RPS | Candidate RPS | Change |
| -------------------- | ----------: | ------------: | -----: |
| First                |       9,023 |         8,242 | -8.66% |
| Reversed assignments |       8,593 |         8,982 | +4.53% |
| Pooled               |       8,808 |         8,612 | -2.23% |

Individual worker means in startup order:

- First: current 8,171; candidate 8,591; candidate 7,893; current 9,875.
- Second: candidate 8,248; current 9,186; current 7,999; candidate 9,716.

The last-started worker is faster than the first in both populations, despite
opposite implementation assignments. This does not prove a startup-order cause,
but shows why attributing the first population's difference to the implementation
alone would be unsound. The hypothesis has no repeatable HTTP support here.
No isolated render-time saving or React comparison is claimed from this capture.

All 838,321 measured responses are valid with zero errors, excluding 800,000
warmup requests and preflights. Response identities match across variants.
Measurement artifact and worker hashes were checked against files. Owned
processes exited; the remaining Node process belongs to the user's Codex.

The adjacent evidence archive contains 38 SHA-256-verified files, including
prototype builder/artifacts, checks, fixture, ownership helpers, original worker,
warmups, raw measurements, log and summary. Raw rows call the candidate combined;
entry paths and hashes identify the boundary-state-machine artifact.

## Implication

Neither the structural-stack experiment nor this boundary dispatcher has justified
changing production. They do not resolve the larger observation that the same
renderer takes more synchronous CPU work per invocation under HTTP than in a
tight isolated loop. A full component stack conversion remains a separate,
untested compiler/runtime redesign; these results should not be represented as
evidence that such a conversion was completed or ruled out.
