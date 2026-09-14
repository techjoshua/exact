# Root render program and dynamic shell audit

Status: investigation and isolated bundle experiment. No production changes adopted.

## Current execution structure

The root cache in `packages/ssr/src/render/root-execution-cache.ts` stores component
identity and validated contracts. It is not a composed document execution plan.
Source references show `resolveSsrComponentExecution` has no callers; the active
receipt path reads contracts through `server-component-reference.ts`. Adding a
second metadata cache would not remove the preparation observed here.

The compiler already hoists render program descriptors and generated writer
functions. It also hoists eligible static server invocations. Dynamic invocations
still allocate an eager slot array and a nominal wrapper in
`createPreparedServerRenderProgram`. `renderProgramWriter` creates a request-owned
output object with its own preparation cleanup lifetime. Component issuance,
ownership, and hydration publication remain separate operations.

A new trace of the retained conditional-emission build records 22 dynamic
invocation constructions, 24 program writer executions, and eight component
executions for the small fixture. The 22 constructions include eight shell/asset
invocations and fourteen application invocations. Repeated list entries and
severity components share descriptors but have distinct request values.
These are operation counts, not measured allocation bytes or CPU percentages.

Ready string, ready stream, and artificially pending head-flush traces produce
identical output to their corresponding uninstrumented control: 4,672 bytes.
String SHA-256 is
`0a81e47ed671b35c366ab1c60ed8592f2715c3ad235673e185fc199bf28af411`;
stream and pending-head SHA-256 is
`9b9e8470279c43fb0a3a6eecd7b29327336d8d6505f1986fbf9eb1ad7cbffdc1`.
The original archive's report incorrectly listed the string hash for all modes;
its raw summaries contain the distinct correct hashes. The archive is preserved.
Instrumentation is unsuitable for throughput claims.

## Dynamic shell fusion experiment

The isolated bundle combines the document's html, head, body, and app container
programs. Dynamic script and stylesheet ranges remain active, application
components render per request, and the existing Document hydration root remains.
The candidate retains head flushing and node/depth accounting. It reduces
invocation constructions from 22 to 19, writer executions from 24 to 21, and
child-group renders from 21 to 18. Component executions and sink writes remain
eight and 89 respectively.

Node string HTTP results, six blocks per variant in all six execution orders:

| Variant | Mean requests/s |
| --- | ---: |
| Retained eXact | 8,708.46 |
| Dynamic shell fusion | 8,730.61 |
| React | 13,351.59 |

The candidate improves the mean by 0.25% and wins three of six paired blocks.
This does not establish a throughput improvement. The capture contains 277,742
valid responses and zero reported errors. Runs use production mode, below-normal
priority, ten seconds of warmup, 1.5-second measured blocks, and two load drivers
with sixteen connections each. Background PC workload can vary.

Eight changing-request comparisons cover string/stream output, empty and dynamic
assets, Unicode, and script-like text. All are byte-identical. Ready and artificial
head-pressure traces also match. The candidate is hand-specialized: authored
static opening tags are extracted from control output, and preparation cleanup
is attached to the combined outer output. These checks do not prove generic
enhancement, cancellation, scheduled-sibling, or root-attribute semantics. No
package/browser suite or Bun timing is claimed for this candidate.

## Next experiment boundary

A root-wide reusable program is feasible as shared instructions with request-local
execution frames. It must not cache request values, component instances, task
results, hydration payloads, or dynamic list topology. Dynamic selection should
invoke reusable subprograms; recursive composition cannot be unrolled indefinitely.

The useful next prototype is compiler-style direct invocation of nested intrinsic
programs within application components. Pass request values to shared instructions
without building an intermediate program-receipt tree, while retaining component
ownership and distinct suspended preparation scopes. Keep a single sink interface
and the same renderer for string and stream output. This is broader than merely
flattening the document shell or adding metadata caching.

Hypothesis: removing intermediate preparation across the application will reduce
invocation/slot allocations and traversal dispatch. A low-single-digit HTTP gain
is a provisional expectation, not a measured result; the shell-only result gives
no basis for predicting that this alone closes the roughly 35% Node string RPS
deficit. Trace counts should first establish that the intended work disappeared,
then paired HTTP timing should test the hypothesis. Preserve early head output,
task ordering, cleanup, hydration identity, and enhancement boundaries in any
generic compiler implementation.

Evidence: `root-program-audit-2026-09-10-evidence.zip` contains the scripts, traces,
HTTP capture, candidate/control bundles, relevant source snapshots, and SHA-256
manifest.
