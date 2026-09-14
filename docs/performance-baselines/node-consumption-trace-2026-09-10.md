# Node consumption and HTTP-path trace, September 10, 2026

The native HTTP comparison leaves a substantial Node string gap even though the isolated
render-and-consume times are close. The user asked to investigate work outside rendering. This
diagnostic first checks the measurement boundary, then traces the actual HTTP request path.

## Measurement boundary

The previous Node in-process harness wraps each completed HTML string in a Web Response and decodes
it through `text()`. Neither native Node HTTP string handler uses that operation. A second mode
instead renders and calls `Buffer.byteLength` before returning the string. It retains an asynchronous
wrapper equally for both frameworks and forces the byte-counting read that HTTP telemetry performs.

Median microseconds per render, lower is better:

| Consumption | Current eXact | React |
| --- | ---: | ---: |
| Render plus UTF-8 byte count | 22.35 | 24.51 |
| Render plus Web Response construction and decoding | 31.09 | 30.41 |

Sixteen fresh Node 26.8.1 processes alternate framework and mode order over four rounds. Each warms
50,000 renders and measures 20,000, in production mode at priority 10. No other timing or build job
runs concurrently. Each framework's output hash is identical across modes. The byte-count mode
favored eXact in all four paired rounds. These are separate populations, not additive phase timers;
subtracting their medians does not isolate a precise Response construction cost.

An owned controlled service and ordinary HTTP workers independently verified the fixture values
and complete output. Locally rendered documents match HTTP responses exactly for each framework.
eXact returns 4,672 bytes and React 3,660 bytes. Both own their full document and render live component
trees. The isolated measurement therefore does not establish that eXact's renderer explains the
HTTP deficit. It also does not prove that production concurrency cannot change rendering costs.

## Actual HTTP request trace

A Node module load hook instruments the existing benchmark worker without changing repository
production code. After 100 ordinary warmup requests, one selected preloaded request enables
`async_hooks`, traces synchronous renderer entry and response/socket methods, and records through
the next immediate callback after response finish. Both traced responses match their controls.

| Observed work | eXact | React |
| --- | ---: | ---: |
| Promise resources created | 16 | 10 |
| Promise callbacks executed | 8 | 5 |
| Tick callbacks executed | 7 | 7 |
| Response `setHeader` calls | 2 | 0 |
| Response `writeHead` calls | 1 | 1 |
| Socket `_write` calls | 1 | 0 |
| Socket `_writev` calls | 0 | 1 |

The response-end call occurs once for each framework. eXact's complete buffered response uses
Content-Length; React explicitly commits headers and uses chunked transfer. The trace counts one
socket write call for eXact and five for React, collected into the respective native write method.
These are method invocations, not operating-system syscall counts. Trace duration includes hook
and instrumentation overhead and is not a throughput measurement. This single ready request is
not a test of backpressure, failure, cancellation, or concurrent-request behavior.

Both render the same component entry used in the isolated comparison. eXact additionally constructs
its buffered response facade, awaits the helper returning that response, and awaits its Node adapter.
React calls `writeHead` and `end` directly after the common render-timing wrapper. The promise-count
difference makes those completion boundaries worth isolating. Counts alone do not prove they explain
the 27.5% current Node string HTTP deficit.

Header policy is an observed difference, not an untested optimization recommendation. Earlier
[explicit-header experiments](ssr-paired-profile-2026-09-08.md) slowed eXact in both populations, and
[response-owner experiments](current-node-response-profile-2026-09-10.md) did not establish an HTTP
gain. Neither changing headers nor removing response ownership is justified solely by this trace.
The next comparison should isolate the actual HTTP handler's completion and delivery costs under
concurrency, preserving identical eXact rendering, bytes, and response semantics.

Production sources and artifacts are unchanged. All task-owned servers exited. These internal
diagnostics do not change public documentation or establish the overall performance goal.

[Evidence archive](node-consumption-trace-2026-09-10-evidence.zip) includes raw timings, HTTP fixture
and identity checks, request traces, instrumentation, participant artifacts, and SHA-256 hashes.
