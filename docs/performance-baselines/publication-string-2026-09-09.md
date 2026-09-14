# Native string collection for the shared staged renderer

Date: 2026-09-09. String sink remains experimental; interruption ownership fix applied to framework source.

The previous collection experiment encoded all text into byte chunks and decoded it at completion.
The hypothesis is that a string sink should avoid this round trip while retaining the same traversal,
task settlement, hydration serializer, and UTF-8 output budget. The candidate accumulates native
strings, charges incoming text once through the existing ledger, and treats head/await flush requests
as no-ops. The byte sink remains responsible for progressive byte publication. No second renderer
is introduced.

Two reversed-order pairs on Node 26.8.1 and Bun 1.4.2 compare the optimized byte sink at 8 KB with
the native string sink. Small: two scheduled children, 2,000 warmups, 6,000 measured renders.
Large: 96 scheduled children, 1,000 warmups, 2,000 measured renders. All processes use production
mode, and no completed samples were discarded. The complete documents match exactly across
variants, including hydration; all children dispose once. These are controlled compiled-tree
fixtures, not the framework-comparison application, and markers remain disabled.

Times are microseconds per render: byte collection / native string (time change).

| Runtime | Fixture | Pair 1 | Pair 2 |
| --- | --- | --- | --- |
| node | small | 84.88 / 62.20 (-26.72%) | 84.64 / 62.91 (-25.67%) |
| node | large | 2375.80 / 2015.02 (-15.19%) | 2188.66 / 2121.37 (-3.07%) |
| bun | small | 34.10 / 32.92 (-3.47%) | 33.95 / 32.05 (-5.60%) |
| bun | large | 1243.60 / 1237.58 (-0.48%) | 1255.15 / 1220.46 (-2.76%) |

The string candidate improves every pair, most clearly on Node. This validates sink specialization
within one traversal, not a speedup against React or the current production string renderer.
The sink remains an integration candidate pending native compiler staging and browser hydration
coverage. 1,380 Unicode/split/budget cases per runtime compare exact encoded bytes, failures,
final byte counts, and destruction with the byte sink. Native strings retain original UTF-16
code units; byte equivalence is checked after encoding, including unpaired surrogates.

## Cancellation ownership defect exposed by integration

The additional closed-task cancellation check printed passing assertions but then exited with
an unhandled TaskCancellation. Both the string candidate and byte control failed on Node and Bun.
The existing awaitWithAbort helper rejected immediately for an already-aborted request without
observing its supplied, already-started promise. Later task disposal could reject that promise.
An already-expired deadline had the same ownership gap.

The framework fix attaches a rejection observer only on those two immediate-interruption branches,
then preserves the original interruption error. Normal waits still use the existing Promise.race
path. Two framework regression tests cover later work rejection after abort/deadline; the four
isolated Node/Bun sink lifecycle processes pass after the patch. The lifecycle checks also cover
invalid hydration and release of collected strings. Raw failure and success output is archived.

Source validation: the SSR package was rebuilt and its compiled fixtures regenerated. All 291
SSR tests passed, including the two new regression cases. Test type checking, changed-source
lint, source architecture, platform boundaries, compiled/released ABI checks, and published
package-content checks passed. Engineering and public SSR documentation describe interruption
ownership. The normal rendering contract and initial ABI epoch are unchanged.

Performance samples predate this exceptional-path fix. It adds no normal-path observer or new
serialization. This report makes no measured performance claim about that fix. The public staged
renderer remains unfinished, and the overall React performance objective remains incomplete.
