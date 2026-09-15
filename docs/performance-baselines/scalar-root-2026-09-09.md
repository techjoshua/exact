# Scalar root attribute experiment, September 9, 2026

Status: promising isolated prototype, not installed in the compiler or runtime.

## Hypothesis and implementation

Removing the request-local root attribute objects from the incident-row and severity-badge programs
should reduce large-workload render time by roughly 1-5%. These two roots each have one dynamic
class expression and otherwise static properties. The large workload executes each root 96 times.

The prototype captures the dynamic class directly in the existing eager slot. Shared program metadata
contains a reconstruction function retaining the original raw static properties. The root serializer
uses the scalar and existing attribute plan directly when no unconsumed target layer is present;
otherwise it reconstructs the original object and enters the existing composition path. It does not
parse serialized HTML, change hydration, cache request data, or add a second rendering engine.

This is an AST transformation of the retained safe-class build. The control is the same build passed
through the same TypeScript printer. The transformation asserts exactly two eligible programs and
two call sites. Its deliberately narrow eligibility is not a proposed public API or a finished
compiler optimization. No inspectable-children API is introduced.

## Method and results

Fresh sequential processes, production NODE_ENV, 5,000 warmups and 12,000 measured renders each.
Four reversed-order pairs per runtime/mode for 96 incidents; two reversed-order pairs for 3 incidents.
Both runtimes load the same portable bundle. String rendering is awaited; streaming responses are
fully consumed through Response.text(). Each application renders its full document, with client asset
tags empty. Every population validates complete-document framing and its final full-response SHA-256
against the paired framework output. This is renderer timing, not HTTP or browser timing.

Median microseconds per complete render, lower is better. Positive reduction means faster.

| Workload | Runtime | Mode   | Control | Prototype | Reduction |
| -------- | ------- | ------ | ------: | --------: | --------: |
| large    | node    | string |  224.45 |    209.56 |     +6.6% |
| large    | node    | stream |  268.67 |    259.52 |     +3.4% |
| large    | bun     | string |  316.60 |    306.32 |     +3.2% |
| large    | bun     | stream |  407.90 |    396.22 |     +2.9% |
| small    | node    | string |   36.51 |     35.98 |     +1.5% |
| small    | node    | stream |   58.37 |     57.83 |     +0.9% |
| small    | bun     | string |   37.12 |     38.00 |     -2.4% |
| small    | bun     | stream |   56.74 |     55.05 |     +3.0% |

The prototype is faster in 15 of 16 large-workload pairs. Small Bun string rendering is slower in
both pairs, approximately 0.9 microseconds at the median. The other small cases have mixed or small
effects. Shared-PC noise and these short samples do not establish confidence intervals or a universal
improvement. React was not rerun here; historical React rates must not be used as a paired comparison.

## Correctness and limitations

Ten focused probes pass on each of Node and Bun. They compare both root types with no layers,
empty layers, already-consumed layers, an active layer containing a quoted class and unsafe attribute
characters, and two active layers. They require identical composed output, consumed flags, and exact
UTF-8 byte accounting. All 48 benchmark populations also produce matching full-document hashes.

These checks do not cover the full compiler contract. Before adoption, general eligibility must
preserve expression evaluation exactly once and in source order, duplicate-property behavior,
reactive values, task settlement, target overrides, scheduled rollback, unsafe HTML/URL handling,
and client/server ABI agreement. Raw static properties must remain available without moving
request-dependent expressions into shared metadata. Broader package and browser validation remains
necessary after an actual source change.

The evidence warrants a compiler experiment. It does not establish that inspectable children are
needed, nor that a general materialized child graph would improve throughput. Removing redundant
root representation can be pursued independently of that design discussion.

## Reproduction

The accompanying evidence ZIP includes the builder, large/small runners, worker, fixed input,
control and prototype bundles, raw results, verification logs, and the retained source bundle.
Run scripts from the repository root with its existing TypeScript dependency and the recorded
Node/Bun versions. The scripts own only synchronous child processes; no server is launched.
