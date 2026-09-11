# Early full-document shell publication

The progressive HTML path now sends the rendered document through its body content before
constructing hydration data. Hydration and closing tags follow in one final write. The concatenated
document is unchanged. Both readable streams and produced responses use the same framing.

## Hypothesis and focused measurement

Earlier shell delivery should let browsers discover CSS and scripts before hydration arrives.
Additional writes were expected to cost approximately 0-5% on small-document throughput. This
experiment targets browser latency rather than faster rendering.

In Chromium, a controlled 200 ms transport hold before hydration-containing chunks let the new
build request both CSS and module JavaScript before hydration was sent. The preserved build could
request neither until afterward. Both loaded the same compiler-rendered application document,
one hydration payload, and the script, without browser errors. The artificial hold demonstrates
overlap, not a measured real-world latency reduction.

The subsequent [actual-streaming browser benchmark](early-document-browser-2026-09-09.md) measured
300 sessions across local and constrained profiles. It found no measurable FCP, LCP, or readiness
improvement, and no CSS discovery before response completion in this workload.

Production-mode streaming HTTP comparison: Node 26.8.1 and Bun 1.4.2, two fresh server populations
per variant in reversed order, two independent drivers with 16 connections each, two seconds warmup
and four seconds measurement. Every timed response was checked against its full byte/hash identity;
baseline and candidate documents also matched exactly. React was not rerun for this focused change.

| Runtime | Preserved build RPS | Early shell RPS | Change | Errors |
| ------- | ------------------: | --------------: | -----: | -----: |
| node    |             5155.62 |         5125.72 | -0.58% |      0 |
| bun     |             5260.01 |         5258.25 | -0.03% |      0 |

These small differences do not establish a throughput improvement. Retain the change for observable
resource-discovery overlap. The published full benchmark charts remain the earlier preserved capture.

## Correctness and scope

Full documents with pending scheduled work settle before shell publication because they cannot use
the fragment replacement protocol after bytes have been sent. Document event streams and fragment
HTML keep their replacement behavior. Cancellation interrupts producers waiting for demand.

A regression test uncovered missing document-host rollback in scheduled render retries. The renderer
now restores root/head/body claims for discarded attempts instead of treating the next valid attempt
as a duplicate document. This correction also applies to asynchronous string rendering.

The change does not flush the head during tree traversal. Rendering the body, and pending tasks
that could revise the document, can still delay initial bytes. A safe earlier publication boundary
remains an open investigation; this is not completion of the broader performance work.

Validation: 260 SSR tests, including seven new publication/settlement/cancellation cases; browser
resource-discovery check; seven application streaming SSR/hydration/interaction checks on Node and
seven on Bun. All 240 hydration tests, compiled and frozen release ABI checks, platform boundaries,
source architecture, JSDoc, changed-file lint, docs typecheck, formatting, and diff checks also passed.

[Raw measurements and source hashes](early-document-2026-09-09.json) preserve the focused results.
The reproducible probe scripts and frozen candidate entries remain under .tmp/early-document.
