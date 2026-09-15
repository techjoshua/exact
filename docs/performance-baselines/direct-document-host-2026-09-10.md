# Direct document-host execution experiment, September 10, 2026

The candidate avoids allocating the nested document-host continuation callbacks when destination
readiness, rendering, and head flushing all finish synchronously. Actual pending work transfers
host cleanup to the existing async cleanup helper. It uses the same descendant renderer and sink.
The hypothesis was a small shell-overhead reduction, without changing output or early head delivery.

## Renderer-focused measurements

Medians in microseconds per complete document, lower is better. These are not HTTP requests/s.

| Runtime/output | Prior eXact | Candidate eXact | React | Candidate faster blocks |
| -------------- | ----------: | --------------: | ----: | ----------------------: |
| Node encoded   |       39.32 |           40.27 | 35.88 |                     1/6 |
| Node stream    |       48.63 |           49.44 | 74.13 |                     2/6 |
| Bun encoded    |       34.72 |           35.92 | 43.53 |                     2/6 |
| Bun stream     |       63.66 |           64.36 | 69.86 |                     1/6 |

All six three-variant orders ran in each of four cells, 72 fresh workers. Each worker performs
50,000 warmup renders and 20,000 measured renders. Node string output is consumed through a Response;
Node streams are fully consumed. Bun uses each framework's native exported response adapter and
consumes the response for both modes. Compare variants within a cell, not absolute Node/Bun times.
Runs use production mode and below-normal priority. The PC remains available for user workloads.
CPU time and elapsed time are both retained in the raw records. No builds, tests, or profilers run
concurrently. All eXact final outputs are byte-identical within each cell.

The initial diagnostic completed Node then failed on Bun because it expected Node-style exports.
The corrected Bun worker uses renderParticipantBunResponse. Completed Node records were preserved;
only missing cells were run. The original script and failure log are retained.

The candidate passed all 370 SSR tests, including synchronous/asynchronous ready, writer, and flush
failures, balanced host ancestry, pending-task early head delivery, cancellation and cleanup.

The candidate was rejected: elapsed-time medians were worse in all four cells, with no consistent
CPU improvement. The extra lifecycle branching was reverted. Both restored server bundles were
verified byte-identical to the pre-experiment shared-head-string build. Decision and hashes are
recorded in decision.json in the evidence archive.
Head registration remains a separate follow-up described in
[the head-registration audit](head-registration-audit-2026-09-10.md).

[Raw evidence](direct-document-host-2026-09-10-evidence.zip) includes both compiled eXact variants,
source before and candidate, measurement workers, scripts, results, and validation logs.
