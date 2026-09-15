# Generated hydration projection for short arrays

Date: 2026-09-09. Rejected blanket cutoff change; production remains unchanged.

## Hypothesis

The current runtime selects compiler-generated record projectors for arrays of at least sixteen
elements. The prototype selects the same projectors for every nonempty array. The hypothesis was
a 2-5% small-document rendering-time improvement from avoiding schema interpretation. Generated
projectors retain all their existing validation and native Set ancestry requirements; the change
does not remove checks or alter serialization. Earlier studies described the cutoff as a heuristic.

## Method

Thirty-two fresh processes compare marker-hex-current and a frozen patched copy across Node/Bun,
string/consumed stream, small/large documents, and two reversed-order pairs per cell. Each population
uses NODE_ENV=production, 5,000 warmups and 12,000 measured renders. Small contains three incidents;
large contains 96. Both include two module scripts and two stylesheet links in their application-owned
document shell. Both runtimes use the same Node-target artifact; streams are consumed through
Response.text(). Every population completed, framing checks passed, and all paired full-body hashes
matched. No observation was discarded.

## Results

Positive means longer rendering time. These are descriptive local pairs, not confidence intervals,
HTTP throughput, browser timings, or a fresh React comparison.

| Runtime | Mode   | Fixture | Pair 1 time change | Pair 2 time change |
| ------- | ------ | ------- | -----------------: | -----------------: |
| node    | string | small   |             -0.46% |             +5.87% |
| node    | string | large   |             -3.39% |             -4.38% |
| node    | stream | small   |            +13.45% |            +10.55% |
| node    | stream | large   |             +2.30% |             -2.32% |
| bun     | string | small   |             +5.20% |             +2.57% |
| bun     | string | large   |             -1.58% |             -3.22% |
| bun     | stream | small   |             +6.32% |             +2.68% |
| bun     | stream | large   |             -9.60% |             -3.38% |

Large-document strings improve in both pairs on both runtimes, but small-document strings do not
show a repeatable gain. Small streaming is slower in both pairs on both runtimes. The blanket
cutoff change is not adopted.

One possible follow-up is to select short-array projectors only after ancestry already uses a
native Set, avoiding early promotion for small documents. A builder for that condition was prepared
but not executed in this capture. No timing or correctness claim is made for it. The current result
does not isolate ancestry setup as the cause of the regression.

The follow-up was subsequently measured against the retained September 10 build and rejected;
see [short projectors with existing Set ancestry](projector-ready-2026-09-10.md).

## Related architecture audit

A subsequent user question prompted inspection of render-program.ts, program-output.ts,
direct-component-content.ts, tree-output.ts, output-stream.ts, and stream/production.ts. Compiled
programs create ordered arrays of HTML spans and deferred child references. Recursive rendering
generally returns subtree strings, which program-output concatenates before tree-output constructs
the final chunked result. Stream consumers can write multiple chunks, but the final request writer
is not passed directly through every component render.

A shared sink passed through traversal could avoid some intermediate arrays and subtree results,
and enable earlier publication within a document. This is a hypothesis requiring an experiment,
not a measured gain. JavaScript string concatenation can use ropes, so repeated concatenation must
not be described as repeated full-byte copying without evidence. Enhancements, output transforms,
document discovery, task scheduling, backpressure, error boundaries, and hydration placement need
explicit treatment before adopting such a design. Component closing markup must not terminate the
request-owned sink. No second rendering engine is proposed.

No production source changed, so no new package/browser suite was run. Fixture hash equality does
not replace general validation or lifecycle tests for an adopted change. Prior retained validation
remains documented in marker-hex-2026-09-09.md. Overall React parity remains unmet.

The archive preserves both artifacts, builder, runner, worker, fixed data, raw observations,
reporter, and SHA-256 manifest. Reproduction requires the workspace dependencies.
