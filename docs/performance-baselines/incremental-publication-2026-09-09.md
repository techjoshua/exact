# Incremental accounting in the direct-publication sink

Date: 2026-09-09. Experimental sink retained for further renderer integration. Production unchanged.

The hypothesis was that rescanning accumulated text at each flush-threshold check adds avoidable
work, especially with many short fragments and an 8 KB threshold. The first candidate counts each
incoming fragment once, shares its standalone count with the existing output ledger, and maintains
pending bytes with a correction for surrogate pairs spanning writes. Its results were mixed:
Node large/8 KB regressed in both pairs, while Bun large/8 KB improved. All measurements are retained.

Inspection identified another growing-string read in that candidate: charCodeAt on pending output
to identify the preceding surrogate. The second candidate instead retains that single state bit
across writes. This avoids examining accumulated output until publication. Results support the
hypothesis that repeated access to growing strings was expensive; they do not independently prove
the engine's internal flattening or allocation behavior.

## Focused sink measurements

Times are microseconds per synthetic document sent through the sink, not complete SSR or HTTP
requests. Both variants receive the same fragments and publish encoded chunks to a byte-counting
callback. The fixture contains an HTML shell and repeated seven-fragment incident rows. It does
not execute components, tasks, hydration serialization, or sockets. It uses ASCII and a non-ASCII
middle dot. Exact emitted bytes and failure behavior are checked separately by the differential audit.

Each cell has two reversed-order pairs in fresh production-mode processes, with 3,000 warmups
and 10,000 measured iterations per process. Node 26.8.1 and Bun 1.4.2. Ranges show both samples;
no completed sample is discarded. The second candidate is compared to the original sink.

| Runtime | Rows | Threshold bytes |      Original us |   Candidate us |
| ------- | ---: | --------------: | ---------------: | -------------: |
| node    |    3 |            2048 |     3.57 to 3.60 |   1.29 to 1.33 |
| node    |    3 |            8192 |     3.58 to 3.68 |   1.35 to 1.39 |
| node    |   96 |            2048 | 106.98 to 117.77 | 24.98 to 25.37 |
| node    |   96 |            8192 | 229.23 to 233.75 | 23.04 to 23.69 |
| bun     |    3 |            2048 |     2.80 to 2.89 |   1.28 to 1.29 |
| bun     |    3 |            8192 |     2.84 to 2.87 |   1.28 to 1.41 |
| bun     |   96 |            2048 | 160.87 to 165.44 | 22.08 to 22.18 |
| bun     |   96 |            8192 | 420.87 to 424.74 | 20.47 to 20.51 |

## Correctness and decision

Each candidate passes 9,660 differential cases on each runtime, including every two-split placement
in a mixed Unicode document, empty writes, explicit flushes, seven thresholds, and five output
budgets. Assertions compare exact emitted bytes, chunk boundaries, publication reasons, final
byte counts, and error messages. Failed sinks release pending text and reject further writes.
The unchanged ledger still owns output-limit enforcement and unpaired-surrogate finalization.

The second candidate also passes twelve compiled-tree hydration/cancellation cases and six
serializer, byte-budget, and blocked-publication failure cases across both runtimes. The existing
hydration validator and serializer remain in use. Markers are disabled in that controlled fixture;
this is not browser adoption coverage.

Retain the second candidate for direct-publication integration. Its 8 KB large-fixture sink cost
falls from about 229-234 to 23-24 us on Node and from 421-425 to about 20.5 us on Bun. These large
ratios describe removal of a prototype sink bottleneck, not improvement over the production
renderer or React. No public production implementation has changed, and no new React comparison
or browser timing was run. Complete renderer and transport measurements remain required.

The evidence archive retains both candidates, their original control, raw timings, differential
audits, staged hydration integration, and SHA-256 hashes. Reproduction requires built workspace
packages. The overall SSR performance objective remains incomplete.
