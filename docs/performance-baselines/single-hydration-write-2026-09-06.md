# One accumulated hydration payload and one JSON write, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Components already contribute captured records to one request-owned collection while HTML renders.
The compiler-closed footer adds that collection by reference to one compact hydration envelope,
validates it, and serializes the complete payload once. Its wire representation is a JSON array
with a version and presence mask, not an object with repeated property names. No per-component
JSON strings or serializer callbacks are necessary for this design.

The [previous immediate-write control](immediate-response-writes-2026-09-06.md) used this single
payload but assembled the opening script tag, serialized payload, and closing tag into one string
for its hydration write. This experiment isolates removing that final wrapper assembly: after HTML,
it serializes and validates the payload byte count, writes the opening tag, writes the entire JSON
payload once, and writes the closing tag. Every published HTML span still goes immediately to
`response.write()`. The adapter does not accumulate strings or detect the hydration boundary.

The payload writer retains graph validation, positional encoding, reactive collection encoding,
script-safe escaping, and byte limits. Node owns UTF-8 output; hydration byte accounting uses
`Buffer.byteLength`. The existing string API remains untouched. This is an isolated bundle
experiment, not a production source or ABI change. Earlier immediate-streaming limitations around
backpressure, error commitment, and cross-span surrogate encoding remain applicable.

## Verification and method

A separately instrumented artifact verifies one complete hydration serialization after HTML and
exactly one JSON write between the opening and closing tags. The payload includes component
resumption data. Real Node responses match baseline byte for byte for ASCII and hostile text,
including closing-script text, U+2028/U+2029, a surrogate pair, and a lone surrogate. The immediate
adapter also passes the assertion that each write has reached the response before its producer
continues.

Two fresh worker populations each run 12 balanced 500 ms c32 windows per variant in ordinary
API-service and preloaded-data lanes, with discarded two-second primes. Response checks follow
timing. The raw capture (local capture: `single-hydration-write-2026-09-06.json`) includes artifact hashes verified
before and after, individual windows, ordering evidence, correctness results, and diagnostic source.
These focused measurements do not replace the public comparison charts.

## Results

| Variant                                      | Ordinary c32 RPS | Preloaded c32 RPS |
| -------------------------------------------- | ---------------: | ----------------: |
| Existing buffered response                   |          2,392.0 |           7,820.0 |
| Immediate HTML, complete script in one write |          2,004.1 |           5,048.6 |
| Immediate HTML, one separate JSON write      |          1,990.2 |           4,885.8 |

The separate JSON write lost 16.8% ordinary throughput and 37.5% preloaded throughput against the
existing collector, losing in both populations and lanes. Compared with the direct whole-script
control, it lost 0.7% ordinary throughput and 3.2% preloaded throughput; its ordinary result changed
direction between populations. Avoiding script-wrapper concatenation did not establish a gain.

Retain the existing accumulated-data and whole-payload serialization design. The experiment does
not support changing its transport to immediate HTML writes for this small fixture. It also does
not establish results for large documents, allocation, or first-byte latency. No production runtime
or compiler ABI change was made.
