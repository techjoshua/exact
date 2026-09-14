# Specialized server map fragment construction

Date: 2026-09-09. Rejected prototype; production implementation unchanged.

## Hypothesis and scope

Direct server maps already construct prepared keyed children, but issue their containing fragment
through the generic fragment constructor. That path destructures props, spreads mapped children
into a rest parameter, scans those known non-array child carriers for normalization, and constructs
optional metadata through object spreads. The hypothesis was a 1-4% rendering-time reduction on
the small asset fixture by avoiding this redundant work.

The prototype specializes only directSsrMap issuance. It retains the generic immutable opaque
operation, the same private fragment store and executor, optional key/domain metadata, and ordinary
fragment rendering. It materializes the iterable before invoking callbacks and preserves
render-before-key evaluation. It coerces the fragment key and reads the current domain after
constructing children, matching the existing order. Props remain an empty per-fragment object.
Only children already wrapped in prepared keyed carriers bypass normalization.

This is narrower than replacing fragments with a new direct server carrier. That architectural
change was not implemented or measured here. The existing constructor has ownership and private
payload contracts beyond simply collecting children.

## Method

Thirty-two fresh processes compare the frozen current marker-hex build with a patched copy:
Node/Bun, string/consumed stream, small/large documents, two reversed-order pairs per cell.
Each population runs NODE_ENV=production, 5,000 warmups and 12,000 measured renders.
The small document contains three incidents; large contains 96. Both contain two module scripts
and two stylesheet links. Both runtimes use the same Node-target artifact. Streams are consumed
with Response.text(). All populations completed, full-document framing checks passed, and every
paired full-body hash matched. No observation was discarded.

## Results

Positive means longer rendering time. These local pairs are descriptive observations, not
confidence intervals, HTTP throughput, browser measurements, or a new React comparison.

| Runtime | Mode | Fixture | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | -5.43% | +2.38% |
| node | string | large | +4.17% | +0.18% |
| node | stream | small | -5.91% | -1.16% |
| node | stream | large | -0.11% | -5.78% |
| bun | string | small | +4.31% | -3.75% |
| bun | string | large | -2.44% | +3.42% |
| bun | stream | small | -4.57% | -3.51% |
| bun | stream | large | +0.99% | +3.85% |

Small streams improve in both pairs on both runtimes. String results do not establish a consistent
benefit, and large Bun streams regress in both pairs. The prototype is not adopted: this shared
construction path should not be split by sink to preserve a small-fixture streaming gain at the
expense of another measured workload. The current retained build remains marker-hex-current.

The experiment does not show that a direct server fragment carrier would be ineffective. It shows
that simplifying construction around the existing opaque receipt is insufficiently consistent.
Any broader carrier experiment must account for private payload redemption, domain/key metadata,
root and nested render dispatch, enhancements, and hydration boundaries.

No production source changed, so no new package or browser suite was run for this rejected
prototype. Hash equality establishes output equivalence for these fixtures, not general lifecycle
or asynchronous correctness. The previous retained validation remains documented in the marker-hex
report. Overall React parity remains unmet.

The evidence archive contains both frozen artifacts, builder, runner, worker, fixed input, raw
results, reporter, and a SHA-256 manifest. Reproduction requires the workspace dependencies.
