# Shared SSR allocation investigation, September 9, 2026

This investigation continues the [compiled document work](compiled-document-2026-09-09.md).
The performance goal remains unmet: eXact wins the measured Node streaming comparisons, while
React retains a substantial large-document string advantage and a Bun streaming advantage.
Focused measurements here supplement the historical full benchmark capture. They do not replace
public browser, navigation, memory, or HTTP charts.

## Retained changes

- Compiler-created root attribute bags read their already-evaluated slots directly. Individual
  attributes retain normal validation, escaping, URL handling, reactive values, and target handling.
- Unobserved stateless SSR components avoid unused attempt and publication lifetime bookkeeping.
  Props, component domains, descendant task issuance, and descendant cleanup remain unchanged.
  Lifecycle or inspection callbacks retain the observable execution path.
- Compiler-proven intrinsic list programs reuse their existing item boundary. Keys still evaluate
  after each item, unwrap, reject missing values, and undergo string coercion. General values keep
  keyed wrappers. Client list ownership and hydration boundaries do not change.

- Component publication reserves numeric marker positions before descendants and captures the
  original component or registry identity. It formats and escapes marker strings only when a
  boundary is actually published. The obsolete eager component-marker helper was removed.

String and streaming output use the same renderer. Application source and React implementations
were not modified. The new compiler-only list proof belongs to the initial unreleased 0.5.0 contract.
Frozen fixtures were not regenerated.

The actual bundles were inspected, not just their source timestamps. The starting bundle contains
24 root-bag preparation calls; the rebuilt bundle contains none. The first list-proof build missed
parenthesized JSX callback bodies. The compiler now unwraps parentheses for its proof, and a
parenthesized, event-bearing regression fixture protects it. Both Node and Bun application bundles
contain the proof on incident and comment list items.

## Final retained renderer comparison

All four retained changes are included here. There are 72 fresh-process populations:
three rotated orders, 5,000 warmups and 12,000 measured renders per population.
Both runtimes load the same portable Node-targeted participant artifacts in this focused
renderer capture. This is not a fresh measurement of each runtime-specific HTTP adapter.
Production mode, full application-owned documents, and empty client asset tags are used.
Streams are completely consumed through `Response.text()`. eXact variant body hashes match.

Median microseconds per complete document, lower is better:

| Runtime | Output | Workload | Starting eXact | Current eXact |  React |
| ------- | ------ | -------- | -------------: | ------------: | -----: |
| node    | string | small    |          42.96 |         39.21 |  26.28 |
| node    | string | large    |         296.87 |        266.95 | 155.96 |
| node    | stream | small    |          70.26 |         64.32 |  82.65 |
| node    | stream | large    |         354.77 |        310.65 | 407.96 |
| bun     | string | small    |          41.96 |         40.81 |  35.47 |
| bun     | string | large    |         449.97 |        375.27 | 223.80 |
| bun     | stream | small    |          64.25 |         61.11 |  63.19 |
| bun     | stream | large    |         495.33 |        460.97 | 322.61 |

The current build improves every median against starting eXact in this capture.
React remains faster for strings and large Bun streams. Small Bun streaming is close.
These results demonstrate progress, not completion of the performance goal.

## Initial longer renderer comparison

Node 26.8.1 and Bun 1.4.2, production mode. All participants construct complete application-owned
HTML documents. Small contains three incidents, large contains 96. Each of 96 fresh-process
populations performs 5,000 warmups and 18,000 measured renders. Three rotated orders compare
starting eXact, the root-attribute change alone, both initial retained changes, and React.
The keyed-list change is **not included** in this table.

Median microseconds per complete document, lower is better. Streams include complete consumption
and decoding through `Response.text()`. Exact output hashes match between eXact variants.

| Runtime | Output | Workload | Starting eXact | Root attributes only | Root attributes + stateless |  React |
| ------- | ------ | -------- | -------------: | -------------------: | --------------------------: | -----: |
| node    | string | small    |          38.29 |                35.72 |                       37.91 |  26.73 |
| node    | string | large    |         308.01 |               297.18 |                      290.67 | 160.78 |
| node    | stream | small    |          63.78 |                59.84 |                       58.87 |  72.76 |
| node    | stream | large    |         359.39 |               338.30 |                      333.80 | 429.25 |
| bun     | string | small    |          41.30 |                39.96 |                       39.63 |  35.69 |
| bun     | string | large    |         430.20 |               399.84 |                      397.54 | 230.95 |
| bun     | stream | small    |          63.06 |                60.42 |                       59.29 |  60.38 |
| bun     | stream | large    |         486.59 |               484.26 |                      460.89 | 342.48 |

These machine-local timings vary with workload and runtime warmup. Compare paired populations
within a capture. Absolute numbers from subsequent captures should not be interpreted as additional
framework gains. Two-order experiments below are exploratory and require confirmation when mixed.

## Experiments and findings

| Experiment                         | Hypothesis                                                                                                | Finding and disposition                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adjacent output batching           | Fewer generated output calls might save 5 to 15% on large documents.                                      | About 0.5 to 3.5% large gains, with small streaming regressions. Not retained.                                                                            |
| Root byte-bound shortcut           | A conservative UTF-16 upper bound could avoid the final UTF-8 scan.                                       | Mostly neutral or slower. Not retained.                                                                                                                   |
| Root attribute preparation         | Remove generic preparation of compiler-created object literals.                                           | Retained after longer paired comparison above.                                                                                                            |
| Stateless bookkeeping              | Skip unused attempt and lifetime objects for stateless components.                                        | Retained with observer and rollback regression coverage; combined comparison above.                                                                       |
| Separate stateless helper          | Move the fast branch out of the main closure.                                                             | Mixed, including slower Bun large streams. Not retained.                                                                                                  |
| Segment and scheduling allocations | Remove result wrappers, filtered arrays, and empty cleanup structures.                                    | Mixed results; combined and isolated variants not retained.                                                                                               |
| Packed positional records          | Construct validated tuples as array literals.                                                             | Bun large regression of roughly 4 to 8%. Not retained.                                                                                                    |
| Hoisted HTML regular expressions   | Avoid repeated regex construction.                                                                        | Some Node string gains, Bun large regressions. Not retained.                                                                                              |
| Observer-only snapshots            | Avoid snapshots when no observation callback consumes them.                                               | Mixed. Not retained.                                                                                                                                      |
| Finite class combinations          | Precompute escaped combinations of compiler-finite class expressions.                                     | Bun large string gain around 7%, Node regression around 5%. Not retained.                                                                                 |
| Keyed program boundary             | Avoid a wrapper and repeated classification around each intrinsic item.                                   | Runtime prototype improved Node large strings/streams about 5% in three pairs; Bun mostly neutral. Compiler-proof form retained and tested separately.    |
| Stateless component publication    | Avoid generic execution, publication, and snapshot wrappers using the shared content renderer.            | First Node large string samples improved about 5%; Bun results mixed. Isolated experiment only.                                                           |
| One JSON escaping pass             | Scan serialized hydration text once for the same three escaped characters.                                | Confirmation found regressions and mixed results. Not retained.                                                                                           |
| Direct leaf string assembly        | Avoid repeated mutable output-array operations in fully textual programs, targeting 5 to 10% large gains. | Some string gains, streaming mixed. Isolated only; no compiler ABI expansion adopted.                                                                     |
| Unused marker formatting           | Keep identity counters but omit unused marker string construction, targeting several percent large gains. | Refined numeric reservation showed large gains on both runtimes. Implemented with original registry identity preserved; rebuilt source validation passed. |
| Native Bun HTML escaping           | Native escaping might reduce the measured HTML escaping cost by 3 to 10% overall.                         | Passed 2,662 parity cases; larger streaming workload regressed. Not retained.                                                                             |
| Inline primitive projection        | Eliminate generic validator calls for common primitive fields, retaining checks and fallback.             | Hypothesis 3 to 8% large. Mixed, including Bun large streaming regression. Not retained.                                                                  |

The metadata, allocation, scheduling, and keyed experiments preserve full eXact output hashes.
The native JSON serializer, wire representation, unsupported-value rejection, and resource limits
remain intact. No request-data cache or alternate rendering engine was added.

## Profile interpretation and workload structure

Fresh large-document CPU profiles cover both frameworks on both runtimes and output modes.
eXact costs include hydration projection and validation, attribute escaping, compiled-program
execution, and final byte accounting. Bun stream measurements also include `Response.text()`
consumption. Profile samples are diagnostic evidence, not ordinary throughput results.

The eXact application renders a `SeverityBadge` component per incident. React inlines the equivalent
span. The large fixture therefore exercises roughly 97 additional eXact component boundaries,
including the detail badge. This is a workload-structure difference, not proof that all of the
performance gap is component overhead. The applications remain unchanged; the boundary experiment
investigates whether the framework can execute ordinary component composition more efficiently.

A separate Node diagnostic ran 40,000 large renders per framework with explicit GC between 5,000-render
windows. Retained heaps plateaued around 6.1 MB for eXact and 7.3 MB for React. This did not show
sustained retained-heap growth. The `allocated` field records end-of-window heap before collection,
not peak memory. Explicit-GC diagnostic timings are not throughput measurements.

## Focused HTTP comparison

Two reverse-order populations per variant, runtime, and output mode: 24 populations total.
The controlled service preloads the same three-incident snapshot. Two independent drivers supply
32 aggregate concurrent requests, with two seconds of warmup and four seconds of measurement.
Every completed response is checked against its full body hash. All populations have zero errors.
The starting eXact build is the preceding compiled-document candidate. The retained build includes
root-attribute preparation, stateless bookkeeping, and compiler-proven keyed programs.

| Runtime | Output | Starting eXact requests/s | Retained eXact requests/s | React requests/s |
| ------- | ------ | ------------------------: | ------------------------: | ---------------: |
| node    | string |                     7,810 |                     7,702 |           10,566 |
| node    | stream |                     6,460 |                     6,154 |            4,107 |
| bun     | string |                     8,525 |                     8,717 |            9,843 |
| bun     | stream |                     6,606 |                     6,622 |            6,850 |

This capture is mixed against starting eXact: Node medians decrease, Bun strings improve, and Bun
streaming is nearly unchanged. It does not demonstrate a universal HTTP improvement. eXact retains
its Node streaming advantage over React, but React remains ahead in the other three combinations.
These are short machine-local capacity samples, not controlled-host confidence intervals.

## Later rejected experiments

Issued-child result layout experiments removed conditional object spreading, allocated preparation
arrays lazily, or filtered references earlier. Some small cases improved, but the combined variants
regressed large Node strings. A follow-up preserving the two original object shapes had mixed
streaming results. None is retained. A direct-domain/direct-fragment prototype script was prepared
but not executed; it is not evidence of a performance gain.

Fresh string profiles still show substantial validation, escaping, allocation, and output byte
accounting costs. Node small-document GC sampled about 11% for eXact versus 4% for React.
Bun large strings sampled approximately 8% positional validation and 7% byte accounting.
These overlapping diagnostic categories are not an additive estimate of removable overhead.
Further investigation should target a measured architectural cost, with an explicit hypothesis,
before another broad matrix of small code rearrangements.

## Validation and ongoing work

The retained root, stateless, list, and marker changes pass native compiler tests, 251 core tests,
274 SSR tests, test type checking, source architecture checks, and 56 production browser checks
across Node/Bun, string/stream, and eXact/React. Browser checks exercise hydration and interactions;
new browser timing or navigation improvements are not claimed.

Final marker changes also pass affected-file lint, source architecture, JSDoc, explicit-any,
platform boundaries, compiled ABI, frozen release ABI, and package-content checks.
The HTTP table above predates the marker change. No new full browser timing capture is claimed.

[Structured results](ssr-allocation-2026-09-09.json) and the
[evidence archive](ssr-allocation-2026-09-09-evidence.zip) preserve raw measurements, profiles,
experiment scripts, frozen artifacts, validation logs, and changed source snapshots. The archive
requires this workspace's locked dependencies for reproduction, especially React 19.2.0 under
`framework-comparison/node_modules`; it is not a standalone distribution.

This is an intermediate milestone. The performance goal remains unmet.

Follow-up: the [hydration upper-bound diagnostic](hydration-upper-bound-2026-09-09.md) finds that
eliminating hydration serialization alone would still leave large string renders behind React.

The [direct leaf output experiment](leaf-direct-2026-09-09.md) found Bun large-string gains,
but small-string regressions and mixed streaming results. The prototype is not retained.

The [flat invocation experiment](flat-invocation-2026-09-09.md) removes eager-value arrays
from the generated artifact. Mixed or slower string results do not support adopting it.

The [retained build HTTP capture](retained-http-2026-09-09.md) includes the marker change and
actual Node/Bun adapters. All 388,339 measured responses are valid; React remains ahead in
three of four combinations. It supersedes the older table for the current HTTP comparison.

The [retained browser capture](retained-browser-2026-09-09.md) supplies 80 current Node-streaming
page-load and claim-interaction samples under local and simulated constrained conditions. It is
a focused timing capture, not a full benchmark replacement or a paired historical regression test.

The [compiler-proven class optimization](proven-class-2026-09-09.md) is now retained. It improves
large renderer workloads on both runtimes while small Bun strings are slightly slower. Earlier
HTTP/browser captures predate this change; the linked report contains rebuilt renderer results.
