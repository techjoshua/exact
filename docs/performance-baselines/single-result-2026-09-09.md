# Single-chunk string result prototype

Date: 2026-09-09. Candidate warrants confirmation; production unchanged.

## Hypothesis and implementation

createChunkedStringResult currently creates a lazy getter closure even when the renderer has
already completed one string. The candidate returns an ordinary html data property for exactly
one chunk and keeps the lazy getter for all other chunk counts. The hypothesis is a small
allocation/dispatch saving most visible on small documents. No numerical gain was preregistered.

The candidate preserves hydration insertion, hidden chunk metadata, state, and optional result
metadata. However, it intentionally changes the single-chunk html property from a getter to a
writable data property and captures its value at result construction. The public TypeScript field
is currently writable, while runtime assignment to the getter throws in strict mode. A production
decision must classify that behavior change and confirm no internal caller mutates the supposedly
readonly chunk array after construction. No compatibility alias is proposed for this unreleased API.

## Method and results

Thirty-two fresh processes: Node/Bun, string/consumed stream, three/96 incidents, two reversed-order
pairs per cell. NODE_ENV=production, 5,000 warmups and 12,000 measured renders. Both runtimes use the
same portable bundle. The application renders its full document, client tags are empty, and streams
are consumed with Response.text(). All paired full-document hashes match.

Positive means longer rendering time. These are preliminary local timings, not confidence bounds.

| Runtime | Mode | Fixture | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | -2.78% | -1.32% |
| node | string | large | +0.10% | -3.31% |
| node | stream | small | -4.00% | -9.91% |
| node | stream | large | +0.52% | -11.25% |
| bun | string | small | +2.17% | -4.62% |
| bun | string | large | +0.92% | +1.10% |
| bun | stream | small | -5.21% | -1.04% |
| bun | stream | large | -1.19% | -10.60% |

Small Node strings and small streams on both runtimes improved in both pairs. Large Bun strings
regressed slightly in both pairs. Several larger stream gains vary substantially between pairs,
so the data warrants confirmation rather than a universal speedup claim. This candidate has not
been rejected or adopted. Follow-up should assess the result-property contract and repeat the
promising cells while checking the Bun string tradeoff.

No production edits, package tests, or browser tests were performed for this bundle prototype.
Hash equality alone is insufficient for acceptance. The overall React parity goal remains unmet;
React and actual HTTP adapters were not measured here.

The evidence archive preserves the frozen control/candidate, worker, runner, builder, fixed input,
raw observations, reporter, and SHA-256 manifest.
