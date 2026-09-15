# Straight-line initial writer execution, 2026-09-10

Hypothesis: separating normal synchronous execution from restoration and switch dispatch may improve throughput by roughly 3 to 8 percent. This prototype preserves the existing renderer and sink API. It changes generated writer structure, not application content or the React baseline.

An AST transform adds a straight-line initial function to each of 18 resumable writer definitions. The seven existing arrow writers remain unchanged. Initial execution performs the original preparation and operation sequence in a labeled block. Every original sink readiness check and pending-child check remains. Actual suspension creates the original saved frame and calls the original resumable writer through one shared Promise helper. That original writer handles subsequent resumptions. No render-mode branch is introduced into the sink API.

The fixed fixture executes 18 transformed and six unchanged writer invocations. Both selections are present in the same worker; the invocation boundary selects the treatment. Duplicated generated code and selection overhead are part of this prototype. A production implementation would need compiler integration and broader semantics coverage before acceptance.

Four normal/escaped full-document parity cases pass. Twelve pressure/failure checks pass on Node and twelve on Bun using the portable artifact. These compare exact writes and errors against the retained build, including a pending sink after every string write and failures at selected write positions. They are focused correctness checks, not a complete compiler or browser validation.

Two fresh production Node 26.8.1 workers run normal/initial/normal, with ten seconds HTTP warmup and five-second blocks. Two fresh drivers each hold 16 requests in flight. Controls are averaged within each worker. Before/after isolated loops warm and measure 10,000 renders. Workstation load can vary; individual controls are shown to expose drift.

| Worker | Normal controls RPS | Initial RPS | Change vs control mean | HTTP us, normal / initial | Isolated us, normal / initial |
| ------ | ------------------: | ----------: | ---------------------: | ------------------------: | ----------------------------: |
| 1      |       8,568 / 7,300 |       7,219 |                 -9.01% |             62.69 / 67.86 |                 27.76 / 31.49 |
| 2      |       8,582 / 8,792 |       8,715 |                 +0.32% |             56.59 / 56.66 |                 23.78 / 24.78 |

All 246,150 measured responses passed complete 4,672-byte document validation, with zero errors. Runtime counters confirm treatment selection and zero suspension in measured string blocks. Artifact and adapter hash guards pass. No production change or new benchmark baseline is claimed.

Raw blocks, summaries, transformation/check/runner scripts, pressure artifacts and SHA-256 inventory are preserved in the adjacent evidence archive.
