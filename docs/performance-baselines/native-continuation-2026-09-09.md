# Native conditional continuation experiment

Date: 2026-09-09. Compiler integration work, not a production performance update.

The native SSR write plan now has an emitter accepting caller-owned output as its fourth
parameter. It removes the local output allocation, preserves preparation, and suspends only when
an operation returns a native Promise or the sink reports a pending drain. Character-count results
are restored before the following write. Rejection stops traversal; the caller retains cleanup
and cancellation ownership. This is an internal sink contract, not a general thenable API.

The first emitter nested two functions per write. Source inspection suggested that this imposed
avoidable calls and closure work on synchronous rendering. The tested refinement uses one
switch-based fallthrough continuation for the entire program. Synchronous writes remain in that
invocation; only pending work creates resume callbacks. The hypothesis was lower synchronous
writer overhead without changing operation ordering or suspension behavior.

## Focused results

Eight fresh production-mode processes, Node 26.8.1 and Bun 1.4.2, two reversed variant-order pairs.
Each warms 100,000 iterations and measures 1,000,000 iterations. The compiler-generated fixture
contains five writes: opening markup, child, separator, child, closing markup. Both variants use
the same simple string collector and synchronous child operations. Every iteration checks output
identity, and a consumed length checksum prevents discarding the generated string. There is no
concurrent build or test workload during timing.

Nanoseconds per fixture execution, including the common output-identity assertion:

| Runtime | Pair | Nested continuations | Fallthrough continuation | Time reduction |
| --- | --- | ---: | ---: | ---: |
| Node | 1 | 92.35 | 56.29 | 39.1% |
| Node | 2 | 89.48 | 56.79 | 36.5% |
| Bun | 1 | 137.95 | 77.34 | 43.9% |
| Bun | 2 | 143.38 | 74.98 | 47.7% |

These are isolated writer measurements, not full component rendering, hydration serialization,
HTTP throughput, browser timing, or React comparisons. They justify retaining the flatter emitter
for integration. They do not establish an application-level percentage improvement.

## Correctness and remaining integration

The native-generated JavaScript passes nine execution cases on each runtime: synchronous output
identity and ordering, pending child settlement, pending head drain, child settlement followed by
a drain, pending final drain, child rejection, drain rejection, synchronous failure, and unprepared
input. The child-count checks verify that the second child receives the first child's settled
character count. Native tests also emit empty and 512-child plans with a single continuation.

The complete native compiler and command tests passed, the native executable was rebuilt, and
the source-architecture check passed. Recompiling the stored small server, large server, and
client-adoption fixtures produced byte-identical code through the existing production selection.
No new browser-performance or runtime-package-suite result is claimed for this internal emitter.

All preparation remains before writes. This does not yet allow task-dependent inputs to be read
early, integrate sibling preparation and hydration capture into the new runtime ABI, or select
this emitter in production. The existing production writer remains the default. The full
Node/Bun string and stream comparison remains the production-refresh baseline; parity is unmet.

The first Go invocation used the wrong working directory for its copy step and reported no tests
to run. That output was not accepted as validation. After correcting the path, the explicit native
test ran and the emitted JavaScript was executed in both runtimes. Raw fixtures, scripts, results,
source, and hashes are retained in the evidence archive.
