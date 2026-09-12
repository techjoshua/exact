# Normal-loading SSR investigation, September 12, 2026

This focused pass starts from `103fa1da`. It does not replace the
[full SSR baseline](bun-adaptive-ssr-2026-09-12.md). Production Node 26.8.1 and Bun 1.4.2
ran serially on the shared Windows PC. Foreground workload can change between measurements.
React's renderer and response handling were not changed.

## The awaited work

The shared participant host fetches `/api/session` and `/api/incidents` concurrently,
awaits both responses, decodes both JSON bodies, and then invokes the selected renderer.
The application's refresh task is client-only. Neither the normal nor preloaded comparison
exercises a pending server component task.

`dataLoadMs` includes the service, socket processing, and continuation dispatch in a process
that is also rendering other requests. Its overlapping wall-clock phases cannot be added
together to attribute process CPU. Slow fetch timing is not proof of task-system overhead.

## HTTP controls

Each capture uses two independent drivers, five seconds of warmup, eight seconds at total
concurrency 32, and two fresh populations with reversed framework order. Complete response
hashes and expected application text are checked. Fetch and decode instrumentation is enabled
identically for both frameworks. All 42 measured participant blocks, including diagnostics
and profiles, recorded zero request errors and zero invalid responses.

Valid RPS for both populations:

| Runtime/API | Policy    |         eXact |         React |
| ----------- | --------- | ------------: | ------------: |
| Node string | automatic | 2,423 / 2,479 | 2,574 / 2,573 |
| Node string | disabled  | 2,550 / 2,512 | 2,641 / 2,680 |
| Node stream | automatic | 2,200 / 2,202 | 1,856 / 1,938 |
| Node stream | disabled  | 2,176 / 2,116 | 1,832 / 1,897 |
| Bun string  | automatic | 4,230 / 4,151 | 4,274 / 4,161 |
| Bun string  | disabled  | 4,302 / 4,292 | 4,113 / 4,180 |
| Bun stream  | automatic | 4,207 / 4,213 | 4,242 / 4,319 |
| Bun stream  | disabled  | 4,194 / 4,166 | 4,236 / 4,050 |

The hypothesis was that batching before fetching could account for much of the gap.
Disabling admission does not eliminate the Node string deficit. Bun string favors disabled
admission here, while Bun stream does not consistently benefit. Policies ran in
automatic-then-disabled order, not a balanced policy crossover. These short screens do not
justify replacing the automatic defaults or overriding longer preloaded measurements.

Node string p99 ranges were 18.0–18.2 ms for automatic eXact and 17.3–17.6 ms for React.
With admission disabled they were 17.0–18.1 ms and 16.8–17.6 ms. Bun string automatic tails
were 10.5–12.4 ms versus 9.6–12.4 ms; disabled tails were 9.7–12.0 ms versus 11.8–12.6 ms.
Every driver percentile remains in the archive; these are ranges, not pooled percentiles.

Two Node string controls tested response writing and the available throughput ceiling:

| Diagnostic                                                             |     eXact RPS | Nearby React RPS |
| ---------------------------------------------------------------------- | ------------: | ---------------: |
| Explicit headers and direct terminal write, retaining body consumption | 2,360 / 2,491 |    2,550 / 2,674 |
| Reuse a rendered document, still fetch and decode every request        | 3,175 / 3,147 |    2,676 / 2,633 |

The writer shortcut is rejected. Frozen rendering is deliberately not equivalent SSR and is
not a framework result. Its increase shows that removing rendering work still matters under
I/O load. Neither diagnostic shortcut is integrated.

## Profiles and fresh objects

The profiled Node string population reproduced the gap: 2,419 eXact versus 2,540 React RPS.
Hydration JSON serialization and positional validation are visible eXact costs. Native socket
writes and Undici processing also occupy substantial samples. Profiles include warmup and
initialization; raw sample totals are not precise per-request CPU costs.

The automatic Node string capture recorded about 6.4–6.9 ms in data loading, 0.03 ms in
decoding, and 0.07–0.08 ms in eXact rendering, including warmup observations. React recorded
about 6.2–6.4 ms, 0.03 ms, and 0.05 ms. Other requests' rendering and socket work can delay
a measured fetch continuation, so the large fetch duration does not isolate the cause.

A render-only screen compared a reused snapshot with parsing that snapshot on every call.
After the initial round, fresh-data eXact measured 19.6–21.3 μs versus React's 22.0–22.7 μs.
This includes parsing but no HTTP and checks output lengths rather than complete hashes.
Fresh object creation alone does not reproduce the HTTP deficit. V8 deoptimization output
is retained; warmup transitions are not treated as sustained faults.

Two hydration candidates were screened against unchanged compiled application bundles:

- Use compiled positional projectors for short arrays too. Directions varied; retain the
  existing threshold of sixteen entries.
- Combine three hydration JSON escaping passes into one replacement. Fresh-data timings
  showed no consistent improvement; retain the current encoder.

These timing screens do not constitute security validation. Neither candidate is integrated.

## Retained task scheduler change

A free task permit previously returned `Promise.resolve()` and was unconditionally awaited.
It now returns directly; only queued acquisition suspends. Nested suspension also reacquires
directly when capacity is free. Task completion, cleanup, and FIFO ownership remain intact.

The expected benefit is small task-start and allocation savings, not a substantial HTTP gain.
V8's `run` bytecode grows from 196 to 203 bytes, but a branch skips `AsyncFunctionAwait` and
`SuspendGenerator` for a free permit. Bytecode size alone mischaracterizes this optimization.

An isolated scheduler screen, including its caller and `Promise.all`, records:

| Tasks per request, limit 4 | Before promises | After promises |
| -------------------------- | --------------: | -------------: |
| 1                          |               8 |              6 |
| 4                          |              26 |             18 |
| 8                          |              50 |             42 |

This eliminates two promises per free-slot acquisition. Counts omit approximately 0.002
promises per request of fixed measurement overhead. Timing at this scale is less compelling
than the allocation reduction.

An attempted component-level variant screen failed its scheduler-reach assertion. Its earlier
timings are invalid evidence for this optimization and are excluded from conclusions. No
component-level speedup or improvement to the normal HTTP results is claimed.

Five focused tests protect immediate start, FIFO admission, cancellation, failure cleanup,
and nested suspension. The rebuilt SSR suite passes all 423 tests. This small change does
not solve the remaining normal-loading throughput gap.

## Evidence and verification

The [evidence archive](ssr-data-path-2026-09-12.zip) preserves raw captures, diagnostic sources,
profiles, bytecode, allocation screens, rejected-screen logs, and verification records.
The normal SSR charts retain the full baseline.

Verification passed: the SSR package build and 423 tests, rebuilt Node/Bun comparison bundles,
88 harness tests, documentation type checking and ten tests, documentation build, desktop/mobile
chart-value checks, package contents, platform boundaries, source architecture, and focused lint.
The rebuilt Node bundle differs from the measured bundle only in the task scheduler change.
The archive records failed diagnostic attempts as well as successful final checks; an attempted
native-component compilation of the SSR runtime package was outside its declared build plan.

The prior performance page exceeded the architecture limit after its metadata update. Its
report types now live in a type-only module, with unchanged chart data and behavior.
The next substantial target remains rendering and hydration cost under concurrent HTTP load;
end-to-end measurements are required to accept a throughput improvement.
