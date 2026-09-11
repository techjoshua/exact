# Same-worker component callback comparison, 2026-09-10

## Question

Resolve the large worker-sensitive Node signal from the integrated shared
component-forwarding screen. Earlier allocation profiles show fewer allocated
bytes, but separate-worker HTTP screens point in opposite directions. This test
toggles shared methods versus the original fresh forwarding closures inside
one artifact and worker. Both execute the same renderer and current descendants.

No operation is stubbed or cached. At each renderComponentReference boundary,
the toggle chooses the two shared execution methods or creates the original
two callbacks capturing context/options. The fixture crosses eight boundaries
per render. Static toggle instrumentation is present in both modes. This changes
call-site feedback compared with dedicated artifacts, so it complements rather
than replaces prior isolated/artifact evidence.

## Method

Two fresh Node string workers each run shared/closures/shared/closures/shared.
Each warms HTTP for ten seconds; blocks last five seconds. Two fresh drivers
per block each hold 16 requests in flight. Each closure block is compared with
the average of adjacent shared blocks in the same worker. Isolated loops before
and after each block warm and measure 10,000 renders in the selected mode.

## Paired throughput

| Worker | Pair | Shared RPS | Closures RPS | Closures change |
| --- | ---: | ---: | ---: | ---: |
| 1 | 1 | 8,674 | 8,739 | +0.75% |
| 1 | 2 | 8,728 | 8,843 | +1.31% |
| 2 | 1 | 8,614 | 8,732 | +1.37% |
| 2 | 2 | 8,676 | 8,103 | -6.61% |

All 432,023 measured responses match the complete 4,672-byte document,
zero errors. Four ordinary/escaped parity cases pass. Counters verify callback
selection. Artifact and adapter hashes are checked; owned worker/load processes
close. HTTP and isolated render-duration details are retained in summary.json.

This experiment is not a fresh React comparison and does not resolve the broader
Node/Bun performance goal. The earlier functional, ownership, browser and
allocation checks are recorded in the
[shared forwarding report](component-forwarding-2026-09-10.md).

The adjacent archive contains source, checks, runner, raw blocks, summary, fixed
fixture, current and diagnostic artifacts and a verified SHA-256 inventory.
Workspace dependencies are not packaged as a standalone distribution.
