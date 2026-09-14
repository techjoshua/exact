# Single-child traversal experiment, September 10, 2026

An initial candidate forwarded prepared programs directly through the existing execution target.
It passed 372 SSR tests, 56 browser checks and type checking, but its trace bypassed only one of
21 generic child groups. Most programs already arrived inside arrays. That narrow branch was
removed without a throughput claim. Its source and artifacts are retained for comparison.

The subsequent candidate handles one-child arrays in the shared child entrypoint without allocating
a multi-child ChildrenOutput object. It retains the same execution target, node/depth accounting,
pending-child flush, captured-output rules and final writer readiness. The hypothesis was a gain
of a few percent from reducing objects and forwarding work, not a second rendering engine.

Traces show ChildrenOutput.render falling from 21 calls to five in both modes, with eight component
executions, 24 render programs, 89 sink writes and one hydration serialization unchanged. Both traced
outputs match the uninstrumented controls byte-for-byte. Trace duration is not benchmark timing.

## Paired HTTP comparison

| Runtime/output | Prior eXact requests/s | Candidate eXact requests/s | React requests/s | Change | Positive blocks |
| -------------- | ---------------------: | -------------------------: | ---------------: | -----: | --------------: |
| Node string    |                  8,583 |                      8,283 |           12,599 |  -3.5% |             1/6 |
| Node stream    |                  7,259 |                      7,242 |            5,123 |  -0.2% |             3/6 |
| Bun string     |                 10,639 |                     10,832 |           10,509 |  +1.8% |             5/6 |
| Bun stream     |                  8,491 |                      8,633 |            8,447 |  +1.7% |             5/6 |

962,350 valid responses, zero errors.

Rejected added branch: Node strings were 3.5% lower in the HTTP round. A follow-up isolating async closures measured Node encoded medians of 30.69 us (retained), 30.60 us (first candidate), and 30.66 us (isolated candidate), essentially unchanged. These results do not justify the added traversal path. The useful node-accounting assertions remain.

Each of four cells uses all six variant orders, 72 blocks total. Workers warm for ten seconds;
measured blocks last 1.5 seconds, with two drivers at concurrency 16 each. Node 26.8.1 and Bun 1.4.2
use production mode, native adapters, full application-owned documents and below-normal priority.
The PC remains available for user workloads. No builds, tests or profilers run during timing.
React is unchanged, and eXact responses are byte-identical within every cell. Short local rates
remain sensitive to workload and runtime state.

The final candidate passes 372 SSR tests, all 56 browser checks, test type checking and focused
ESLint. Existing marker/capture/async fixture comparisons now also assert equal node accounting and
balanced traversal depth. These checks preserve the same HTML, hydration and lifecycle contracts.
The production decision is recorded in decision.json in the archive; candidate test results do not
imply adoption or React parity.

[Evidence archive](single-child-traversal-2026-09-10-evidence.zip) preserves both prototypes, sources,
traces, paired results, scripts and validation logs. Larger shell/hydration integration remains open.
