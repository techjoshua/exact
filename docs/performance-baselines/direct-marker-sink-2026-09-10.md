# Direct marker sink experiment, 2026-09-10

Marker traversal now writes opening and closing spans to the active sink instead of capturing a subtree string. It respects opening and closing pressure and flushes before awaiting pending children. Completed resumption/refresh strings retain synchronous finalized wrapping. Client-island and server-slot wrappers capture their children locally to prevent children escaping the wrapper.

Hypothesis: removing subtree marker capture would reduce intermediate construction beyond the previous compiler-boundary condition change. The experiment does not establish a consistent speedup. Direct publication is retained as part of the shared sink architecture; performance remains unresolved.

Production Node 26.8.1, Bun 1.4.2, React 19.2.0. Each cell averages two fresh processes in reversed order, with 5,000 warmups and 12,000 measured renders per process. Both frameworks render complete application-owned documents with four asset tags. Streams are consumed completely. These are in-process timings, not HTTP throughput. Small documents contain three incidents and large documents 96. eXact complete-document hashes match the saved compiler-boundary control.

| Runtime | Mode | Document | Previous (µs) | Direct markers (µs) | React (µs) |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | assets | 37.20 | 36.78 | 23.06 |
| node | string | large | 171.06 | 172.86 | 132.95 |
| node | stream | assets | 57.64 | 57.38 | 66.04 |
| node | stream | large | 200.19 | 194.80 | 338.63 |
| bun | string | assets | 35.41 | 35.67 | 32.26 |
| bun | string | large | 229.31 | 223.77 | 189.36 |
| bun | stream | assets | 55.30 | 54.06 | 53.90 |
| bun | stream | large | 278.33 | 276.86 | 268.79 |

An earlier 48-process experiment preceded the final wrapper safeguards. Its raw results are also archived separately: Bun large streams went from 273.98 to 282.47 µs, React 265.67 µs. This possible regression prompted the final-build repeat above. Small differences on this shared workstation need further evidence; neither reduced GC nor an overall win is established.

Validation: package build, 318 SSR tests, repository test typecheck, focused ESLint, source architecture, platform boundaries, and package contents passed. Focused tests cover opening pressure before child execution, closing pressure before completion, pending-child flush, rejection without closing publication, and observing child settlement after flush failure. Existing compiled document tests compare HTML, hydration records, and cleanup against local capture. Client-boundary and keyed server-slot tests now assert that children remain inside their wrappers.

The final isolated application artifact includes wrapper safeguards and is the measured direct variant in the table. Raw samples, exact bundles, harnesses, and changed source are archived. Main comparison application outputs were not overwritten. No browser timing was run for this internal change; browser performance and full HTTP parity remain unproven. Native writer ABI migration and progressive public tree-to-transport integration remain unfinished.
