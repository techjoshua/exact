# Opaque operation prototype experiment

Date: 2026-09-09. Decision: do not adopt this representation from current evidence.

## Hypothesis and scope

The fresh Node profile highlighted opaque operation creation on small renders. The existing
constructor defines identity and executor symbol properties on each operation, then freezes it.
The candidate shares those two immutable properties on a frozen prototype cached per executor
in a WeakMap. Each operation remains a distinct frozen object. Metadata is still copied and frozen
per operation, and private payloads remain in their existing WeakMaps. No child, task, or issuer
scope is removed. The hypothesis is a small allocation reduction most visible on small documents;
no numerical gain was preregistered.

This changes own-property reflection and the direct prototype of operations. Existing symbol lookup
continues to work, but output equality is not proof of cross-runtime or public reflection semantics.
A production implementation would require core contract, reactivity, hydration, and lifecycle
review. The experiment applies only to a frozen SSR bundle and does not change production code.

## Method and results

Thirty-two fresh processes: Node/Bun, string/consumed stream, three/96 incidents, two reversed-order
pairs per cell. NODE_ENV=production, 5,000 warmups, 12,000 measured renders, complete authored
documents, empty client tags, same portable bundle on both runtimes. Streams are consumed using
Response.text(). All paired full-document hashes match. No HTTP or browser timings are measured.

Positive means longer rendering time. Both pairs are shown; two observations on a variable-load
workstation are preliminary evidence, not confidence bounds.

| Runtime | Mode | Fixture | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | -10.78% | -2.66% |
| node | string | large | -4.86% | +8.37% |
| node | stream | small | -1.60% | -0.17% |
| node | stream | large | +7.06% | +1.79% |
| bun | string | small | +4.65% | -2.79% |
| bun | string | large | -3.21% | +9.30% |
| bun | stream | small | +6.63% | +1.63% |
| bun | stream | large | -2.70% | -9.61% |

Small Node strings improve in both pairs, but large Node streams and small Bun streams regress in
both pairs. Other cells are mixed or variable. This does not support a global representation change
with its additional semantic review cost. No retained optimization was removed. No package/browser
tests were run for this rejected bundle prototype, and no React parity claim follows from it.

The result argues against this particular shared-prototype approach, not against reducing server
carrier construction more directly. A future compiler-owned carrier would still need to preserve
fragment keys, domains, enhancement routing, and scheduled-child ownership rather than simply
turning every fragment into an array.

The archive preserves the frozen bundles, builder, worker, runner, fixed input, raw observations,
reporter, and SHA-256 manifest. The overall objective remains unmet.
