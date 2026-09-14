# Source sink component and structural capture

Date: 2026-09-10. Internal runtime integration following the
[ordered program sink foundation](source-program-sink-2026-09-10.md).

## Failure and correction

A compiler-backed document reproduced an ordering defect when the shared destination was
selected: `<em>Ready</em>` was written before its child-range and component opening markers.
The markers then enclosed an empty range. Hydration records alone still matched, showing why
record comparison does not replace checking the rendered DOM protocol.

The source now uses one scoped capture helper for enhancement routing, marker wrappers,
ordinary intrinsic receipts, and components needing local publication. Scheduled components
capture their output because render attempts may retry; a discarded attempt cannot be retracted
from a response. Marked component output is captured until its publication wrapper is known.
Standalone resumption boundaries that embed component HTML also retain local output.
The same visitor performs captured and directly published rendering. The destination is
restored after descendant settlement on success, failure, or cancellation.

Child traversal now writes scalar siblings in order before another child can publish directly.
It preserves adjacent-text separators and waits for destination readiness before advancing.
Program and child visitors share the pre-await flush helper, including its rule that a failed
drain must not release an ancestor while a descendant still owns its scope.

## Validation

The full SSR suite passed 303 tests after the source changes. The final focused compiler-backed
suite passed ten cases after adding cancellation, intrinsic capture, and routed-enhancement
coverage. These cases compare document HTML and hydration records with the existing local
collector, with markers enabled and disabled. They also verify scalar ordering, root-prefix
routing without duplicate construction, and cleanup ownership.

A compiled authored document sends its stylesheet-bearing head to the internal destination
while its marked body component remains pending. A separate test aborts after head publication
and component setup, then verifies balanced setup/disposal, restored destination identity, empty
host scopes, and no closing body tag after cancellation. These boundary tests run under Node;
they are not browser benchmarks or a claim of public response behavior.

SSR package build, test type checking, focused ESLint, source architecture, platform boundaries,
and package contents checks pass. Public entry points still do not install the destination, so
public documentation does not advertise progressive tree publication yet. Engineering guidance
describes the current integration boundary.

## Overhead experiment

Hypothesis: the added capture guards should have little cost when ordinary public rendering
does not select the shared destination. This compares the previous source integration artifact
with the new boundary integration artifact, not the native-writer prototype or React.

Each cell averages two reversed-order fresh-process samples, with 5,000 warmups and 12,000
measured renders each. Node 26.8.1 and Bun 1.4.2 run in production mode. The authored document
shell, four assets, and hydration/bootstrap output are included; streams are fully consumed
through Response.text(). No build or test ran concurrently with timing. All complete document
hashes match their controls. Units are microseconds per document, not HTTP requests/s.

| Runtime | Document | Mode   | Before | Boundary integration | Change |
| ------- | -------- | ------ | -----: | -------------------: | -----: |
| node    | assets   | string |  35.23 |                35.68 |  +1.3% |
| node    | assets   | stream |  55.91 |                54.49 |  -2.6% |
| node    | large    | string | 160.19 |               160.14 |  -0.0% |
| node    | large    | stream | 192.47 |               194.47 |  +1.0% |
| bun     | assets   | string |  34.67 |                35.22 |  +1.6% |
| bun     | assets   | stream |  50.80 |                49.98 |  -1.6% |
| bun     | large    | string | 225.04 |               226.77 |  +0.8% |
| bun     | large    | stream | 279.62 |               278.88 |  -0.3% |

The small sample count and machine variation do not establish a throughput improvement.
This work removes correctness blockers for selecting the shared destination. React was not
rerun, and its previously reported string lead remains unresolved.

## Remaining work

Request-owned string and streaming destinations still need to be connected to public entry
points. Native compiler writer selection and its ABI migration remain separate unfinished
integration work. Other retry/replacement boundaries, hydration-tail publication, transport
cancellation, and browser adoption need validation with the complete public path enabled.
The new capture behavior is deliberately conservative; unnecessary component capture can be
reduced after the integrated path proves publication ownership and is measured.

The [evidence archive](source-sink-boundaries-2026-09-10-evidence.zip) preserves the timed
artifacts, raw samples, source changes, compiler-backed fixtures, validation output, and
build/run scripts under a verified SHA-256 manifest.
