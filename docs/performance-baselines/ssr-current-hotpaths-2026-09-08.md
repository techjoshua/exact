# Current SSR hot paths, September 8, 2026

Fresh Node 26.8.1 profiles of the retained markerless build with native hydration byte accounting
identify long dynamic-text escaping as the largest new optimization target. Hydration publication
remains the clearest framework overhead on the original small document. No runtime changes were
made during this investigation.

## Method and limits

Each workload uses two populations in reversed participant order, five seconds of warmup and ten
seconds of inspector sampling per participant. Two independent load drivers validate every complete
response against its SHA-256 identity. The original document targets 6,000 combined offered RPS;
the Unicode extension targets 3,000. The extension appends 1,000 repetitions of a space, two CJK
characters, and an emoji to each incident title for both frameworks. Service data is preloaded.
Build artifacts remain unchanged throughout each capture and include the retained native counter.

Both participants use the same Node HTTP harness. This workload exercises the eXact produced-body
adapter, not the full `createExactNodeHandler` request-context and endpoint-dispatch pipeline.
Profiles run serially with no concurrent builds or tests. Other workstation activity is uncontrolled.

Numbers below are sampled wall-time microseconds per valid request, weighted across the two
populations. They are attribution estimates, not exact CPU timings, exclusive native instruction
costs, or throughput predictions. Windows scheduling, inspector overhead and native-call attribution
affect them. Separate process CPU measurements vary noticeably between small-document populations.

There are zero response errors or identity failures. Original-document admission misses total 14
for eXact and 13 for React. Unicode admission misses total 1,411 for eXact and 5 for React, out of
60,000 offered requests per participant. The larger eXact profile is load-constrained; this capture
must not be presented as a clean capacity benchmark. All owned processes closed successfully.

## Profile attribution

| Sampled work (us/request)                                | Original eXact | Original React | Unicode eXact | Unicode React |
| -------------------------------------------------------- | -------------: | -------------: | ------------: | ------------: |
| HTML rendering, components, escaping and byte accounting |          29.25 |          34.54 |        123.12 |         55.07 |
| Hydration publication or React document/state envelope   |          10.07 |           2.58 |         65.09 |         27.80 |
| Response ownership and adapter                           |           2.90 |            N/A |          3.44 |           N/A |
| HTTP output and socket work                              |          33.28 |          31.30 |         87.71 |         68.07 |
| HTTP input and dispatch                                  |          11.86 |          10.00 |         14.83 |         12.25 |
| Benchmark telemetry                                      |           7.26 |           7.83 |          9.45 |          7.77 |
| Garbage collection                                       |           0.84 |           1.28 |          4.17 |          2.33 |

Idle, profiler control and unclassified runtime/harness samples are retained in the machine-readable
analysis but omitted from this table. The React state row includes document-envelope construction;
it is not an identical hydration implementation. Its unclassified runtime/harness attribution is
also larger, particularly for Unicode, so these rows cannot be summed into a complete causal gap.

The complete documents are 3,485 versus 3,384 bytes for the original fixture, and 80,485 versus
80,384 bytes for Unicode, eXact versus React respectively.

## Ranked experiments

1. **Long dynamic text in `escapeSsrText`.** The function's self samples rise from 1.06 to 85.49
   us/request between the original and Unicode fixtures. React's `escapeTextForBrowser` measures
   3.97 and 21.27 respectively, although it does not implement eXact's byte ledger. Source inspection
   confirms that eXact still loops over every UTF-16 code unit to combine escaping and UTF-8 counting.
   This path does not use the supplied native byte counter. Test a length-gated native search for
   `&`, `<` and `>`, followed by the existing native-capable output accounting when no escaping is
   needed. Preserve the current loop for short or escaping-heavy text until measurements justify
   another choice. Verify output limits, escaping and surrogate pairing across emitted spans.
   This opportunity is separate from the already-retained hydration counter forwarding.

2. **Hydration serialization in `serializeJson`.** This combined `JSON.stringify` and script-escaping
   function accounts for 4.92 us/request originally and 58.10 on Unicode. Validation/projection is
   only 3.87 and 4.48, so it does not explain the payload-size increase. First isolate stringify
   from the three replacement operations on captured real payloads. The current profiles do not
   separate those operations. Earlier combined-regexp experiments were rejected; these samples do
   not establish that repeating that change will help. Investigate the actual positional-array
   representation and serialization costs before proposing a new encoder or protocol.

3. **Final response encoding and socket submission.** eXact's `writeUtf8String` self samples are
   23.10 originally and 63.31 on Unicode; React's `writev` is 22.65 and 55.61. eXact collects the
   produced strings and calls `response.end(output)`, while React explicitly writes headers first.
   Test whether carrying already-known complete byte lengths through the response owner avoids
   Node's final length scan, and separately measure flattening/encoding before revisiting buffer
   output. These are hypotheses, not proof that the syscall or a buffer pool is the problem.
   Earlier header-only and buffer experiments did not establish a repeatable win.

4. **Small-object positional projection.** `validatePositionalValue` self samples remain about
   3.10 to 3.30 us/request. The current array path selects compiler-generated projectors only at
   length 16 or greater; this fixture contains three incidents. Benchmark specialization for short
   arrays and primitive fields against the current interpreter, including lookup and ancestor-set
   costs. Retain unknown-value fallback and single-read behavior. Do not infer that all validation
   is redundant or that removing limits recovers the entire serialization bucket.

Response-owner construction and attribute accounting are smaller opportunities. The previous
merged-owner microbenchmark improvement did not translate to HTTP throughput. Likewise, the input
category difference does not establish a separate eXact HTTP parser or justify changing request-body
handling that this fixture never calls. GC is not the dominant source of the gap.

The first experiment should target long dynamic-text escaping. The small-document renderer advantage
does not extend to this larger Unicode workload, even after the hydration byte-counter improvement.

The [evidence archive](ssr-current-hotpaths-2026-09-08-evidence.zip) contains all eight raw inspector
profiles, captures, analysis, runners, bundle snapshots and relevant source snapshots, with a SHA-256
inventory. Public aggregate benchmark results remain unchanged.
