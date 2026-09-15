# Child issuer boundary substitution, 2026-09-10

## Hypothesis and scope

Hypothesis before measurement: removing the task-issuer boundary from this task-free fixture will improve HTTP throughput by roughly 2 to 5 percent. Earlier experiments changed empty-array allocation; this diagnostic removes the entire boundary to measure its potential contribution.

The ordinary path invokes the original renderIssuedServerComponentChildren and asserts that it returns synchronously without preparation. The treatment calls the same render callback and readDirectSsrContent directly, returning the same content wrapper. Component execution, state, props, publication, child traversal, sink writes and surrounding ownership remain active. The issuer callback, prepared list, issuer scope and issuer-specific failure cleanup are bypassed.

This is a fixed-fixture diagnostic, not a valid general optimization. An authored call or getter can issue a scheduled child even if its final HTML is a leaf. General removal would require a compiler effect proof or equivalent guarantees. Successful output parity does not establish cancellation or failure safety for this bypass.

Two fresh production Node 26.8.1 string workers each run normal/bypass/normal after ten seconds of HTTP warmup. Five-second blocks use two fresh drivers with 16 requests each. Adjacent controls are averaged within each worker. Isolated loops before and after each block warm and measure 10,000 renders. Workstation load can vary. Compare only within this instrumented experiment.

| Worker | Normal RPS | Bypass RPS | Change | HTTP us, normal / bypass | Isolated us, normal / bypass |
| ------ | ---------: | ---------: | -----: | -----------------------: | ---------------------------: |
| 1      |      8,422 |      8,559 | +1.62% |            58.27 / 57.50 |                24.19 / 24.31 |
| 2      |      8,706 |      8,968 | +3.01% |            56.32 / 55.02 |                24.35 / 24.35 |

All 259,178 measured responses matched the complete 4,672-byte document, with zero errors. Four ordinary/escaped document parity cases pass; each exercises eight issuer boundaries. Counters verify treatment selection. Artifact and adapter hash guards pass. No production code changed.

This isolates a portion of component preparation, not the entire cost of ownership or compiled program construction. Gains cannot be added to previous substitutions. Raw results and a verified SHA-256 inventory are preserved in the adjacent archive. This is not a new full benchmark baseline.
