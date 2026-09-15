# Rendering context and repeated HTTP renders, September 10, 2026

Status: diagnostic evidence, no production changes. The current Node string HTTP gap is much larger
than the isolated renderer comparison predicts. Previous phase measurements place much of the
observed difference inside synchronous renderer execution under HTTP load. This investigation asks
whether imports, monitoring, concurrent ready renders, or event-loop scheduling can reproduce it.

## In-process context controls

Median microseconds per complete render plus UTF-8 byte counting:

| Context                                    | eXact | React |
| ------------------------------------------ | ----: | ----: |
| Standalone                                 | 21.98 | 23.76 |
| Node adapter/server imports and monitoring | 21.79 | 24.81 |
| Same imports, batches of 32 ready renders  | 22.24 | 25.04 |
| Same batches, yielding between batches     | 21.98 | 24.45 |

Thirty-two fresh Node 26.8.1 processes cover four rounds with reversed framework and context order.
All run in production at priority 10, with `--expose-gc` matching HTTP workers. Each process warms
50,000 renders and measures 20,000. The imported modes load the actual built Node adapter and server
entry points, install a GC observer, and enable a one-millisecond event-loop histogram. The batch
modes use `Promise.all` for 32 render completions; the yielding mode uses `setImmediate` between
batches. Tight microtask loops do not reproduce HTTP callbacks or full worker telemetry, so these
controls narrow the question without claiming to recreate the entire server environment.

Each framework's output hash matches across all contexts. eXact's large HTTP render-interval penalty
does not appear in these controls. Imports, this monitoring setup, ready-render concurrency, and
simple yielding are insufficient individually or in these combinations to explain it.

## First versus subsequent renders inside one HTTP request

A load hook wraps each participant's ordinary rendering entry. It renders the same requested
document four times before returning the final HTML string. Every repetition is compared with the
first output. The wrapper records the first complete render and the three subsequent complete
renders separately. Request data, assets, renderer, hydration publication, and response delivery
remain ordinary; there is no cached HTML or bypassed application tree.

Mean elapsed microseconds under this diagnostic HTTP workload:

| Render position                | eXact | React |
| ------------------------------ | ----: | ----: |
| First in the request           | 54.44 | 36.05 |
| Subsequent in the same request | 31.77 | 24.44 |

The corresponding diagnostic rates were 4,625 HTTP requests/s for eXact and 5,779 for React. Each
request performs four full renders, so these are not normal SSR scores and must not replace the
single-render benchmark charts. An unmodified eXact single-render control also ran in the capture
to retain the existing three-variant ordering protocol; its workload is explicitly different.

All six variant orders use ten-second worker warmup, 1.5-second measured blocks, two drivers at
concurrency 16 each, production Node 26.8.1, and priority 10. The 18 blocks completed 171,833 valid
HTTP responses with zero errors. Every started measured request completed. eXact control and
repeated-render outputs are byte-identical. Four repeated application executions are intentional
diagnostic work, not a proposed server behavior.

Both frameworks render faster on subsequent calls before returning to HTTP processing. eXact's
first-versus-subsequent difference is larger: 22.67 µs compared with React's 11.61 µs. This supports
investigating execution locality, call-site optimization, allocation behavior, or other interaction
with the intervening HTTP workload. It does not prove an instruction-cache, data-cache, JIT, or GC
cause. Subsequent renders still include allocations, hydration publication, timer overhead and
promise completion. Their timings must not be subtracted from ordinary HTTP RPS to derive a CPU
budget. The PC remains available for user activity, and only one timing workload runs at a time.

The evidence favors changes that reduce work or improve execution locality in the actual HTTP
path over assuming isolated tight-loop timings predict server throughput. Compiler-issued program
partitioning remains one structural candidate; the prior dynamic-shell prototype is still unmeasured
and unintegrated. No package or browser validation is claimed because no production implementation
changed. The retained bundles remain byte-identical, and all task-owned processes exited.

[Evidence archive](render-context-2026-09-10-evidence.zip) contains the context controls, repeated
HTTP render hook, raw results and telemetry, fixtures, source artifacts, and SHA-256 manifest.
