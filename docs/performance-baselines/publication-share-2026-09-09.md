# Current hydration publication cost

Date: 2026-09-09. Diagnostic measurement, no production change.

## Audit and hypothesis

The current positional validator creates final positional arrays; the ordinary serializer walks
them with JSON.stringify rather than cloning the graph. Reactive collection substitution has a
separate replacer only when needed. Removing positional arrays would therefore require fusing
projection and encoding, not simply deleting an existing duplicate copy.

Hypothesis: hydration publication still occupies at least 15% of large-fixture renderer time,
making it a more consequential optimization target than the isolated forwarding wrapper.

## Measurement

A frozen copy of the retained synchronous-callback bundle wraps renderHydrationScriptValue with
performance.now() and cumulative call/time counters. Each of eight fresh processes performs 5,000
warmups and 12,000 measured renders. Counters reset after warmup. Every measured render publishes
exactly once. Node and Bun use the same portable artifact with NODE_ENV=production. Small means
three incidents; large means 96. The application renders its complete document with empty client
tags. Streams are consumed with Response.text(). Full document hashes match the previously captured
control for both fixture sizes.

The timed publication scope includes metadata construction, validation/projection, JSON encoding,
script escaping, byte counting, and script markup. It excludes earlier component state capture and
later insertion into the document. This is one instrumented population per cell, not a paired
performance comparison or React benchmark. Clock calls, rest-argument forwarding, and changed JIT
decisions can perturb the measurement. Reported shares are approximate diagnostic evidence.

| Runtime | Mode   | Fixture | Publication microseconds/render | Share of render time |
| ------- | ------ | ------- | ------------------------------: | -------------------: |
| node    | string | small   |                            3.25 |                10.9% |
| node    | string | large   |                           34.49 |                21.7% |
| node    | stream | small   |                            4.16 |                 9.2% |
| node    | stream | large   |                           36.38 |                19.9% |
| bun     | string | small   |                            3.27 |                10.4% |
| bun     | string | large   |                           43.99 |                18.5% |
| bun     | stream | small   |                            4.16 |                 9.4% |
| bun     | stream | large   |                           46.56 |                16.4% |

The large-fixture results support the hypothesis. Publication remains worth investigating, but
eliminating all measured work would be an unattainable upper bound: state still needs validation,
encoding, and delivery. These timings do not show which publication substage dominates and do not
justify removing validation. The next useful measurement separates projection/validation from
JSON encoding and byte accounting before designing a fused encoder.

Production code and retained improvements are unchanged. No package/browser tests were run for
this diagnostic-only artifact. The React parity objective remains unmet. The archive preserves
control and instrumented bundles, builder, worker, runner, input, raw results, reporter, and hashes.
