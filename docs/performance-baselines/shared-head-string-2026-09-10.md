# Root document recognition and shared head string, September 10, 2026

Two sequential experiments retain the shared component executor and descendant writer. The first
moves progressive root recognition out of ordinary component execution. The second removes the
head sink's duplicate string accumulation and write/destroy overrides. The head is an immutable
reference to the collecting sink's existing output at the flush boundary. Later appends preserve
that prefix. Byte limits remain enforced before head publication and at final completion.

Hypotheses: restricting document recognition should remove irrelevant work from ordinary rendering;
reusing the existing string should modestly improve streaming by removing duplicate prefix writes
and their wrapper calls. Neither change alone is expected to close the Node string gap.

## Root-only document recognition

| Runtime/output | Prior eXact requests/s | Candidate eXact requests/s | React requests/s | Change | Positive blocks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node string | 6,174 | 6,193 | 9,712 | +0.3% | 3/6 |
| Node stream | 5,008 | 4,792 | 3,796 | -4.3% | 1/6 |
| Bun string | 8,697 | 8,373 | 8,691 | -3.7% | 0/6 |
| Bun stream | 6,280 | 6,397 | 6,626 | +1.9% | 3/6 |

729,271 valid responses, zero errors.

## Reuse the collecting sink string

| Runtime/output | Prior eXact requests/s | Candidate eXact requests/s | React requests/s | Change | Positive blocks |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node string | 7,285 | 5,822 | 5,773 | -20.1% | 1/6 |
| Node stream | 3,334 | 3,487 | 2,796 | +4.6% | 2/6 |
| Bun string | 5,413 | 6,806 | 6,246 | +25.7% | 3/6 |
| Bun stream | 7,643 | 7,813 | 8,288 | +2.2% | 5/6 |

640,571 valid responses, zero errors.

## Interpretation and validation

The root-only experiment did not establish a consistent throughput improvement. Its Node string
result was neutral, Node streaming and Bun string were lower, and Bun streaming was slightly higher.
Do not describe this isolation as a proven speedup. The shared-string round suffered pronounced workload interruptions: unchanged React Node-stream
blocks fell as low as roughly 600 requests/s, and a Bun-string control block fell to roughly 1,200.
No slow blocks were removed. These data cannot establish a causal throughput benefit or regression
for the sink change. It is retained as simpler ownership with fewer duplicate writes and passing
behavioral checks, not as a measured speedup. The second table measures the incremental sink
change against that root-only build, not against the original early-head build.

Every cell uses all six three-variant orders, ten seconds of worker warmup, 1.5-second measured
blocks, and two drivers at concurrency 16 each. Node 26.8.1 and Bun 1.4.2 run production builds at
below-normal process priority. Each framework renders its full application-owned document.
React is unchanged. No builds, tests, or profilers run during timing. The user may use the PC;
short local measurements and cross-round absolute rates must not be treated as stable capacity.
Every response is validated, and eXact outputs are byte-identical within each cell in both rounds.

The root-only build passed 369 SSR tests and all 56 browser checks across Node/Bun string/stream.
The shared-string build passed 370 SSR tests, all 56 browser checks, test type checking, and focused
ESLint, source architecture, JSDoc, frozen and initial ABI checks, and package-content checks.
Direct package-check invocation first failed with Windows spawn EINVAL; rerunning with the npm CLI
path supplied through npm_execpath passed. Both logs are retained. Tests cover consumer-visible head delivery before pending body tasks, cancellation and
single disposal, UTF-8 limits before publication, one-time head delivery, and complete final output.

This retains full-body collection after early head commitment; it does not establish a fully
incremental body writer. Application-only hydration and generalized shell compilation remain
separate unfinished work. React parity in all four cells is not established.

Raw results, scripts, frozen build artifacts, source files, and validation logs are preserved in
[the evidence archive](shared-head-string-2026-09-10-evidence.zip).
