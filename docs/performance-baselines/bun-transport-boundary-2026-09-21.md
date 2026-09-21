# Bun direct-stream cancellation boundary, September 21, 2026

A fresh minimal reproduction on installed **Bun 1.4.2** confirms the cancellation limitation recorded in the [earlier transport investigation](ssr-sinks-2026-09-09.md#bun-sink-experiments-and-workarounds). No framework code or benchmark protocol changed.

The producer publishes one chunk, then waits for cancellation to release its owned work. The consumer reads that chunk and cancels. The test observes cancellation and producer-finally callbacks after cancellation settles and a 20 ms observation interval. It tests both the stream directly and a `Response.body` reader. Standard streams serve as controls. Test-owned blocked work is explicitly released afterward so the reproduction does not leak it.

| Stream     | Consumer             | Cancellation hook calls | Producer cleanup completions |
| ---------- | -------------------- | ----------------------: | ---------------------------: |
| Standard   | Stream reader        |                       1 |                            1 |
| Standard   | Response body reader |                       1 |                            1 |
| Bun direct | Stream reader        |                       0 |                            0 |
| Bun direct | Response body reader |                       0 |                            0 |

See the [observations](bun-transport-boundary-2026-09-21.json) and [executable reproduction](bun-transport-boundary-2026-09-21-evidence.zip).

This is a lifecycle probe, not a throughput measurement or an HTTP disconnect test. It demonstrates that the tested direct-source cancellation hook cannot enforce eXact's public reader-cancellation cleanup contract on this runtime. It does not prove that every possible adapter workaround is impossible. The prior investigation tested a standard wrapper: it restored cancellation but lost throughput and did not preserve bounded production under paused demand.

The previously faster success-only native prototype therefore remains unsuitable without another proven ownership design or a runtime fix. The [current scheduler follow-up](bun-scheduler-followup-2026-09-21.md) independently rejects shorter control probes because string latency improvements came with throughput losses. Neither limitation justifies dropping cancellation, pressure, hydration, or output-limit correctness. The [full progressive-output capture](bun-stream-counting-final-2026-09-21.md) still measures the retained implementation.
