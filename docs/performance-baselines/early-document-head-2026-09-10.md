# Consumer-visible document heads, September 10, 2026

Retained runtime correction: progressive HTML can deliver a completed head from a synchronous
compiled document before a body descendant's task settles. Full-document body descendants now
settle in their first traversal. Fragment shell/replacement behavior remains unchanged, and a
document component with its own pending head-changing work still settles before publication.

The original public-consumer regression test timed out while the body gate was held. An internal
writer flush test had passed, but the public path collected the full document before sending its
shell. The first head-delivery candidate exposed two body component instances for one completed
response. The corrected test receives the head with the body gate still closed, completes the body
once, and verifies one disposal. Cancellation after head delivery also releases the pending body
without opening the task gate.

## Final paired HTTP comparison

| Runtime/output | Prior eXact requests/s | Corrected eXact requests/s | React requests/s | eXact change |
| --- | ---: | ---: | ---: | ---: |
| Node string | 7,787 | 7,948 | 11,908 | +2.1% |
| Node stream | 7,189 | 6,948 | 5,064 | -3.4% |
| Bun string | 10,259 | 9,742 | 10,857 | -5.0% |
| Bun stream | 8,229 | 7,905 | 8,683 | -3.9% |

There were 925,327 valid responses and 0 errors. All six variant orders
ran in each cell, 72 blocks total. Node 26.8.1 and Bun 1.4.2 used production mode and their native
adapters, with full application-owned documents. Each worker warmed for 10 seconds; blocks lasted
1.5 seconds, with two drivers at concurrency 16 each. Processes used below-normal priority. No
builds, tests, or profilers ran during measurement; the user remained free to use the PC.

Every response was hash-validated. Prior and corrected eXact documents were byte-identical within
each cell after stream reassembly. React was unchanged. These short local rates vary with machine
activity and runtime state; compare variants within a round rather than treating absolute changes
between rounds as framework gains.

## Regression investigation

The first 72-block candidate run completed 857,860 valid responses with zero errors. Its Node
string mean fell from 8,339 to 7,055 requests/s, with all six pairs favoring the control. Node stream
was 6,191 versus 5,918; Bun string 9,712 versus 9,770; Bun stream 7,675 versus 7,526.

The correction confines document-head probing to progressive destinations and restores the shared
component execution call signatures. A three-way renderer-only screen, all six orders and 18 fresh
processes, measured 30.71 microseconds/render for the prior build, 30.47 for the first candidate,
and 30.59 for the correction. It used 50,000 warmup renders and 20,000 encoded-string measurements
per process. All outputs were byte-identical. It did not reproduce the HTTP slowdown.

A subsequent three-way Node string HTTP run measured 8,651, 8,898, and 9,603 requests/s respectively.
The original 15% slowdown therefore did not persist. These observations do not establish a single
cause for it or justify claiming that the correction alone recovered a stable 15% loss. All raw
rounds remain archived.

## Implementation and validation

The shared renderer recognizes a synchronous root's issued HTML program before choosing local
capture. Non-document and speculative output retain capture. A progressive destination publishes
the head under transport backpressure while retaining the completed document for existing framing
and final output checks. It verifies the UTF-8 head limit before commitment and releases both
retained strings on destruction. Framing subtracts the published prefix from the later shell and
inserts hydration before the final body/html tags. Whole-output extensions retain collected
publication. Plain string rendering does not publish partial results.

The corrected runtime passed 368 SSR tests in 58 files and all 56 browser checks across Node/Bun
string/stream, including application and script DOM identity. The final exact-byte-limit guard
and timer typing refinement passed a focused three-test run. Test type checking and ESLint passed;
source architecture, JSDoc, and initial/frozen ABI checks passed during the implementation.
The compiler ABI epoch is unchanged. Initial release guidance documents the progressive head
framing and advises consumers not to assume the first chunk contains body content.

This destination still retains the document for final framing; it is not a fully incremental body
writer. The server-only enclosing-shell/application hydration boundary remains unimplemented.
The broader goal of outperforming React in every comparable workload is not complete.

[Evidence archive](early-document-head-2026-09-10-evidence.zip) contains frozen controls and both
candidates, raw measurements, consumer/browser tests and logs, implementation source, reproduction
scripts, and a verified SHA-256 manifest.
