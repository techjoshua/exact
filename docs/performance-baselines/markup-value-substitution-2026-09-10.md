# Dynamic markup value substitution, 2026-09-10

## Hypothesis and scope

Hypothesis before measurement: replacing dynamic markup generation with recorded strings will improve HTTP throughput by roughly 5 to 10 percent if escaping and attribute generation explain a meaningful part of the remaining gap. This differs from the earlier sink substitution, which still computed every input string.

An AST transformation changes generatedSsrOperations text and attribute helpers. It records or replays string values by request-local occurrence and operation identity. The fixture executes 47 substituted values: 24 root attribute strings, 19 dynamic text strings (including any text marker), and four compiled attributes. Static-prefix/suffix concatenation, character-limit checks, individual sink writes, child traversal, component execution, state capture, hydration and surrounding ownership remain active.

Both modes reset their occurrence cursor at renderHydratableOutput. Records are rebuilt when the fixture is reset, and operation order is checked. Root attribute helpers reject pending target contributions, because skipping their consumption would be an invalid diagnostic. Dynamic input evaluation before the helpers still runs. General validation and reference effects inside substituted attribute helpers are intentionally bypassed; this fixed-fixture experiment is not a safe general cache or production optimization.

Two fresh production Node 26.8.1 string workers each run normal/replay/normal after ten seconds of HTTP warmup. Five-second blocks use two fresh drivers with 16 requests each. Adjacent controls are averaged within each worker. Isolated loops before and after each block warm and measure 10,000 renders. Workstation load can vary. Instrumented results should be compared within this experiment.

| Worker | Normal RPS | Replay RPS | Change | HTTP us, normal / replay | Isolated us, normal / replay |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8,655 | 9,079 | +4.90% | 56.90 / 53.02 | 24.45 / 22.31 |
| 2 | 8,651 | 9,044 | +4.55% | 57.01 / 53.70 | 24.33 / 21.84 |

All 263,950 measured responses matched the complete 4,672-byte document, with zero errors. Four ordinary/escaped document parity cases pass. Counters verify 47 values per checked render. Artifact and adapter hash guards pass. The source artifact matches the current built participant SHA-256, 6882479fc08ae551f88751a2395f44491f98e5a10f871476f5b520b5ce61e6f3. No production code changed.

This isolates dynamic markup generation across leaf and branching writers. It does not remove branching control flow, eager input construction or prepared program invocations. Effects overlap other substitutions and cannot be added. Raw results and a verified SHA-256 inventory are preserved in the adjacent archive. This is not a new full benchmark baseline.
