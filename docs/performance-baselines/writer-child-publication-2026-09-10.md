# Shared writer child publication, 2026-09-10

The staged caller-output writer now has direct child/component publication through writeProgramChild. It checks delimiter budgets before child execution, preserves marked and marker-free output, flushes before pending child work, and retains prepared-sibling ownership through flush failure. Current marker rendering reuses the same writeProgramBoundary implementation. Components remain independent of sink type.

This is migration work, not the completed compiler cutover. writeProgramChild is covered by focused tests but not yet selected by generated production writers. The current production change is the shared marker-boundary implementation. The timing check below guards that refactor; it does not measure removal of segment arrays.

Production Node 26.8.1 and Bun 1.4.2. Each cell averages two fresh processes in reversed order, with 5,000 warmups and 12,000 measured complete app-owned document renders per process. Streams are fully consumed. These are in-process timings, not HTTP throughput. Small documents contain three incidents, large documents 96, and both include four asset tags. Complete document hashes match the saved += control. React was not rerun for this refactor guard.

| Runtime | Mode   | Document | Previous (µs) | Shared publication (µs) |
| ------- | ------ | -------- | ------------: | ----------------------: |
| node    | string | assets   |         35.49 |                   35.75 |
| node    | string | large    |        167.08 |                  165.20 |
| node    | stream | assets   |         56.58 |                   55.73 |
| node    | stream | large    |        196.67 |                  198.62 |
| bun     | string | assets   |         35.27 |                   34.95 |
| bun     | string | large    |        236.28 |                  228.77 |
| bun     | stream | assets   |         51.50 |                   50.93 |
| bun     | stream | large    |        276.17 |                  273.37 |

Small differences on the shared workstation do not establish a repeatable gain. The shared implementation is retained to keep boundary semantics consistent during compiler integration.

Validation: all 331 SSR tests passed, including marker pressure/failure tests and four new cases covering shared/local children with all marker combinations, delimiter-budget rejection before child execution, and prepared-sibling disposal only after pending child settlement when flushing fails. Package build, repository test typecheck, focused ESLint, source architecture, platform boundaries, and package contents passed.

The scheduling review confirmed that references issued later inside the generated writer must explicitly participate in sibling preparation; the outer component render issuer does not observe that later work. Full integration still requires core writer/operation types, native emitter selection, direct operation helpers, both runtime entry points, compiled fixture validation, and initial ABI documentation. No browser/HTTP benchmark was run for this guard. React parity remains unfinished.
