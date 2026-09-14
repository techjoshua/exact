# Server shell and incremental body checks, September 11, 2026

Status: focused implementation checks, not a final full benchmark baseline. Application shell
separation and incremental delivery are implemented. Finer task-span readiness and final release
validation remain open in the [fixed completion scope](../ssr-completion.md).

## Workload and controls

The user reported a change in PC usage. Every comparison below reruns the older artifact and
unchanged React during the new capture. Historical timings are not controls. Each cell uses two
fresh server populations in reversed orders: prior/current/React, then React/current/prior.
Each participant warms for seven seconds and measures for five seconds, with two drivers at
concurrency 16 each. Runs use production Node 26.8.1 or Bun 1.4.2 and below-normal process priority.
No builds, browser checks, or profiles run during capacity measurements.

All participants render their complete authored document and application tree for every request.
The controlled input has 96 incidents. Input loading is excluded by the existing preloaded-data
diagnostic; rendering and HTTP response delivery are included. Each response is checked against
the participant's complete expected byte count and SHA-256. All measured responses passed, with
zero errors. These short local runs describe observed capacity, not a workload-independent ranking.

## Combined shell and body change

The older artifact has the previous whole-document collector. The candidate adds `documentShell`
application-only hydration, incremental body flushing, bounded transport read-ahead, and awaited
cancellation cleanup. This comparison does not isolate those changes individually.

RPS entries retain both repeats in their measurement order:

| Runtime / mode | Prior collector, rerun now | Shell and body candidate | React, rerun now |
| -------------- | -------------------------: | -----------------------: | ---------------: |
| Node string    |              2,645 / 2,718 |            2,506 / 2,968 |    2,951 / 3,132 |
| Node stream    |              2,252 / 2,288 |            1,659 / 1,491 |    1,136 / 1,125 |
| Bun string     |              2,328 / 2,859 |            2,105 / 2,280 |    2,496 / 2,541 |
| Bun stream     |              2,837 / 2,262 |            1,781 / 1,500 |    2,116 / 1,602 |

Incremental delivery has a substantial throughput cost against the prior collector in both
streaming repeats on both runtimes. Current eXact remains ahead of React in these Node streaming
blocks, and behind React in the Bun blocks. React's Bun streaming results vary by about 24%, so
small differences elsewhere cannot be treated as stable improvements merely because runs are paired.

Tail latency is retained in the raw driver distributions. For Node streaming, candidate driver
p95 values range from 24.911 to 29.295 ms and p99 from 27.423 to 32.191 ms. The prior collector's
corresponding ranges are 19.343 to 19.679 ms and 21.871 to 22.287 ms; React's are 35.071 to
35.743 ms and 40.287 to 41.631 ms. These are ranges across driver/block percentiles, not pooled
percentiles. The throughput cost also appears in the candidate's tails against the prior collector.

## Reusing the direct document entry

The first shell integration sent the string shell through generic component-root traversal.
The next change uses the existing direct document entry for an explicit shell in both rendering
modes. It preserves the shared engine and avoids generic root capture where the document entry
can execute the generated writer directly. The hypothesis was a modest string-path recovery,
roughly 5% to 15%, rather than a solution to streaming transport costs.

The comparison below reruns the immediately preceding shell candidate, not the original collector.
Before timing, complete candidate HTML must match that preceding build byte for byte.

| Runtime, string mode | Generic shell entry | Direct shell entry |         React |
| -------------------- | ------------------: | -----------------: | ------------: |
| Node                 |       2,783 / 2,625 |      2,724 / 2,964 | 2,882 / 2,967 |
| Bun                  |       2,122 / 2,287 |      2,471 / 2,340 | 2,479 / 2,498 |

The change is retained for its simpler use of the existing document entry and identical output.
It improves both Bun repeats and one Node repeat; the Node result is mixed. The direct entry does
not change the streaming branch, and this experiment makes no claim to recover its throughput cost.

The candidate document is 36,228 bytes, compared with 36,478 for the original collector and 40,302
for React. The 250-byte reduction comes from application-owned hydration, not cached application HTML.

## Incremental delivery follow-up

A diagnostic that replaced per-span UTF-8 counting with character counting recovered some
throughput, but it was not retained because character counts do not enforce byte limits correctly.
Node control repeats were 1,585 / 1,455 RPS versus 1,650 / 1,720 for the diagnostic. Bun repeats
were 1,462 / 1,439 versus 1,507 / 1,473. This isolates byte counting, not every possible string
flattening cost: character inspection still occurs in the diagnostic.

A separate trace counted Promise initializations during one render and consumption. One flush
threshold of read-ahead produced 179, two produced 178, three produced 48, and four produced 39.
The complete document and chunk sequence were identical. These counts are diagnostic observations,
not timings or a guarantee for other application trees.

Allowing four thresholds of transport read-ahead reduces suspension inside the component stack
while preserving bounded pressure and the existing flush size. Fresh HTTP measurements were:

| Runtime, stream mode | One-threshold queue | Four-threshold queue |         React |
| -------------------- | ------------------: | -------------------: | ------------: |
| Node                 |       1,609 / 1,500 |        1,672 / 1,629 | 1,184 / 1,207 |
| Bun                  |       1,545 / 1,476 |        1,620 / 1,664 | 1,669 / 1,698 |

The four-threshold queue is retained. Driver p95 values improved in each comparison, but p99 was
mixed, including an approximately 3 ms increase in one Bun block. This is not a universal latency
improvement. The default remains an 8192-byte flush threshold, with 32768 bytes of read-ahead;
accepting a complete span may exceed that queue budget.

## 2048-byte flush experiment

The installed React Node renderer uses a 2048-byte encoding buffer. Its buffer also handles
partial encoding and large-span bypass, so matching that capacity alone does not reproduce its
write implementation. This experiment tests eXact's flush threshold, which accepts whole spans.
The head still flushes separately, and hydration remains a final publication.

Two candidates isolate flush size from read-ahead: a 2048-byte threshold with the control's
32768-byte queue, and the same threshold with an 8192-byte queue. Fresh servers run all four
variants in forward and reversed order under the current PC workload. React is unchanged.

| Runtime, stream mode | 8 KB / 32 KB queue | 2 KB / 32 KB queue | 2 KB / 8 KB queue |         React |
| -------------------- | -----------------: | -----------------: | ----------------: | ------------: |
| Node                 |      1,654 / 1,664 |      1,628 / 1,624 |     1,555 / 1,502 | 1,193 / 1,158 |
| Bun                  |      1,778 / 1,828 |      1,725 / 1,788 |     1,486 / 1,466 | 1,741 / 1,757 |

All measured responses passed full-document byte-count and hash checks with zero errors. Each
eXact variant produces the same 36,228-byte document. The 2 KB threshold loses approximately
1.6% to 3.0% against 8 KB with read-ahead held constant, across these four comparisons. Reducing
the queue as well loses more. Keep the configurable 8192-byte default.

Response latency ranges below retain individual driver/block percentiles, not pooled quantiles:

| Runtime / variant  | p95 range, ms | p99 range, ms |
| ------------------ | ------------: | ------------: |
| Node, 8 KB / 32 KB | 24.559–25.103 | 27.871–29.423 |
| Node, 2 KB / 32 KB | 25.023–25.279 | 27.791–29.583 |
| Node, 2 KB / 8 KB  | 26.207–27.631 | 30.079–31.023 |
| Node, React        | 33.759–35.103 | 36.735–39.743 |
| Bun, 8 KB / 32 KB  | 21.711–22.399 | 24.623–29.135 |
| Bun, 2 KB / 32 KB  | 22.687–23.359 | 25.487–30.735 |
| Bun, 2 KB / 8 KB   | 28.127–28.591 | 33.439–34.655 |
| Bun, React         | 22.831–23.615 | 25.791–26.703 |

TTFB distributions are preserved in the captures. These HTTP checks do not measure CSS parsing
or browser paint. Both thresholds retain the same early head publication.

A subsequent untimed Node trace on the same fixture at `/` produced identical 36,213-byte
documents. The 8 KB threshold emitted 6 chunks and initialized 40 Promises; 2 KB with the fixed
queue emitted 15 chunks and initialized 57; 2 KB with the smaller queue emitted 15 chunks and
initialized 227. These observations support additional publication and suspension overhead as
an explanation, but do not isolate the CPU cost of either. They also do not rule out a different
byte-buffer implementation performing better at 2 KB.

## Task-owned document discovery

A gated trace exposed a separate source of unnecessary work. Before the compiler identified a
document root on its server artifact, progressive HTML invoked a scheduled document view with
pending state to discover its HTML shape. That output was discarded, and the view ran again with
settled state. An ordinary enclosing shell with the task in the application already avoided this.

The compiler now emits `documentRoot: true` for a direct authored document view. Progressive HTML
settles that document's tasks before invoking its view. This retains the single engine and leaves
fragment shell/replacement behavior intact. Conditional and indirect document views retain runtime
discovery. This does not yet publish task-independent spans inside the scheduled component early.

The gated trace now records `task-start`, `release`, `task-complete`, `read:ready`. Previously it
also recorded `read:pending` before release. Complete output remains identical. The separate-shell
trace still delivers its head before release.

A focused Node benchmark compares the same compiled fixture with the document proof present or
removed, using the same current runtime. Both variants warm for 5,000 renders; each block then
warms for another 1,000 and measures 10,000. The task gate releases on `setImmediate`, and each
iteration consumes and verifies the complete HTML. The order reverses for the second population.

| Variant                | First run, µs/render | Second run, µs/render | View reads per render |
| ---------------------- | -------------------: | --------------------: | --------------------: |
| Without document proof |                60.93 |                 51.93 |                     2 |
| With document proof    |                46.11 |                 46.54 |                     1 |

These are serial render-and-consume timings for a small gated fixture, including its diagnostic
event recording and validation. They are not HTTP throughput, React comparisons, or a final
framework baseline. An earlier short warmup produced mixed timings, so the consistent reduction
in unnecessary reads and the correctness regression test are stronger evidence than a universal
percentage claim. The comparison application's shell is synchronous and should not receive this
scheduled-document improvement.

## Static head within a task-owning document

The compiler now proves a conservative output region for canonical documents whose head is static
and whose body contains intrinsic markup and direct state reads. The existing task owner settles
before the deferred body reader runs. Calls, child components, dynamic attributes, enhancements,
and nonblocking tasks retain ordinary whole-view readiness.

The trace emits the 179-byte head before releasing the task, followed by 64 bytes of body and
147 bytes of hydration and closing tags. The completed document is 390 bytes. A real Chromium
HTTP check requested the stylesheet at 10.4 ms while the task was released at 255.2 ms, applied
the stylesheet, and displayed the settled body value. This gated diagnostic demonstrates early
resource discovery, not a throughput or general browser timing improvement.

After extracting prepared server invocation ownership into its own Core module, 453 selected
Core and SSR tests pass. They include cancellation after head publication, cleanup, task failure,
and settled string output. Publication, platform, JSDoc, and test type checks also pass.

## Validation

The shell and cancellation implementation passed all 412 SSR tests. Browser checks passed all 56
cases across Node/Bun string/stream, including adoption without root replacement and later
interactions. After selecting the direct shell entry, 49 focused SSR checks and 28 string-mode
browser checks passed. The retained four-threshold queue then passed all 412 SSR tests and all
56 Node/Bun string/stream browser checks. The document-proof change passes the native compiler
suite, 413 SSR tests, all 56 rebuilt Node/Bun string/stream browser checks, focused Core metadata
validation, lint, publication preflight, and frozen compiled/release ABI checks at 0.5.0,
epoch 1. These checks do not close the broader completion list.

Raw captures, per-driver tails, artifact hashes, executable runners, frozen comparison bundles,
and browser logs are preserved in [the evidence archive](ssr-shell-body-2026-09-11-evidence.zip).
Archived diagnostic runners contain workspace paths that must be relocated to replay elsewhere.
