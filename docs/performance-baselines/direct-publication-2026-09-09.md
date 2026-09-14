# Early head publication from the direct writer

Date: 2026-09-09. Internal prototype, not a production stream implementation.

The direct-writer prototype can now route ordered writes to a request-owned sink callback. A
successfully completed head program flushes that sink, and a deferred child flushes before its
returned promise is awaited. This experiment tests whether the current traversal can publish an
independent head before actual scheduled body work completes. It does not measure throughput.

Four cases pass across Node/Bun and success/cancellation. The child components use real native
compiler output, real blocking tasks, and lifecycle disposal. The parent and static head programs
are hand-built against the experimental writer ABI. Before the shared task gate opens, the sink
receives these two flushes in order:

1. `<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head>` (head complete).
2. `<body>` (before waiting for the first child).

After success, joined sink output is the complete document with Ready 1 and Ready 2 in order.
On cancellation, rendering rejects with AbortError while the gate is still closed, no later body
content is published, each child is disposed exactly once, and host ancestry is unwound. The test
clears its deadline timer and releases its gate and sink in cleanup.

The initial test reached the older prototype's blanket component-boundary rejection. That guard
was narrowed to cases actually requiring a marker or resumption boundary. With markers disabled
and no required resumption boundary, the ordinary renderer already returns child HTML directly;
there is no boundary to capture. Required boundaries remain rejected by the prototype.

## Limits and next integration

This sink is a recording callback with string staging and explicit flushes. It is not the public
HTTP/ReadableStream adapter, performs no byte-capacity batching, and does not enforce the final
encoded output limit. The fixture disables markers and does not publish hydration. Therefore this
does not prove a complete hydratable response, buffer ownership, Unicode chunk encoding, or
transport backpressure. The compiler does not yet emit the parent's dependency-aware stages.

The sink hook is useful evidence that ordered direct traversal can expose the independent shell
without waiting for the body tasks. It does not establish that public eXact streams do so today.
Next integration must preserve output limits, required markers, hydration-at-tail ordering,
cancellation, and backpressure, and replace the hand-built parent with compiler-emitted staging.
Existing complete-document benchmarks remain the performance reference. No production files,
public APIs, browser results, or React comparisons changed. The overall goal remains incomplete.

The evidence ZIP includes the input prototype, patch builder, emitted fixture, test harness, raw
publication traces, this report, and a verified SHA-256 manifest. Built workspace packages are
required for the fixture imports.
