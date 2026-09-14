# SSR request sequence trace, September 10, 2026

A temporary instrumented copy of the retained shared-head-string bundle traces one warmed Node
string request and one streaming request. Production source and builds are unchanged. Both complete
outputs match their uninstrumented controls byte for byte (4,672 bytes in each mode). This is an
execution-order diagnostic, not a timing benchmark. Instrumentation adds callbacks and promise
observers, so its durations and observed promise wrapper counts are not production costs.

## Sequence evidence

Both requests execute eight components and 24 render programs, create 22 prepared program objects,
and write to the collecting sink 89 times. Both invoke hydration serialization once, after tree
completion. There is no duplicate application execution in this fixture. Four executions share a
component definition because the application uses it at four positions; this is not a retry.

String order: prepare Document, render head and application, finish collecting sink, create the
string result, publish hydration, insert hydration into the document, consume the response.
Streaming order: prepare Document, flush head, resume the application, finish collecting sink,
publish the remaining shell and hydration, complete response consumption.

The streaming head flush returns a promise which propagates through ancestor render boundaries.
Those pending spans are ancestors of one suspension, not separate component tasks. Targeted demand
trace events show the initial reader wait entering with demand zero. All four subsequent checks
enter with demand one. The current `createProgressiveHtmlStream` implementation nonetheless awaits
`waitForDemand`, `emit`, and the event callback because each is unconditionally async.

The next experiment should preserve the initial demand wait and return synchronously from emission
when demand is already available. It must propagate that conditional completion through the head
sink rather than merely moving an async wrapper. Validate early consumer-visible heads, task waits,
backpressure, abort/error cleanup, and browser behavior. These traces alone do not establish that
removing the suspension improves throughput or browser latency.

The sink's destroy method is invoked twice (finish plus outer request cleanup); it is idempotent.
This is distinct from component disposal and does not demonstrate a double-disposal bug.

## Allocation and CPU context

Separate warmed Node encoded-string allocation samples estimate 78,477 bytes/document for eXact
and 91,621 for React, including sampled objects collected by minor and major GC. These are profiler
estimates, not exact allocation totals or retained heap. They include Response encoding/consumption,
and eXact and React document sizes differ. eXact does not allocate more overall in this capture.

The largest eXact sites include renderProgramWriter (6,092 bytes/document), synchronous component
execution (4,914), hydratable result construction (4,767), final join (4,736), and response decoding
(4,706). Sampled CPU self time places serializeJson at 5.37%, positional validation at 4.43%, document
prefix recognition at 3.62%, and hydratable result construction at 3.14%. GC self time is 2.56% for
eXact and 2.64% for React; these fractions have different total durations. This evidence does not
establish excessive eXact GC as the current explanation of the throughput gap.

## Artifacts

[Evidence archive](request-sequence-2026-09-10-evidence.zip) contains Chrome trace-event JSON files,
per-request counts, an abbreviated sequence, instrumented and control artifacts, instrumentation
source, allocation profiles, CPU profiles, and raw measurements. The trace JSON can be loaded in a
compatible trace viewer. The instrumentation records function labels, compiler identities, write
lengths, and demand values; it does not copy rendered text into events.

The head-registration proposal remains a separate follow-up in
[its audit](head-registration-audit-2026-09-10.md).
