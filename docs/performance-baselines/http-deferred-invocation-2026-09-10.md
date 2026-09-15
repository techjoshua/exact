# Deferring renderer invocation during HTTP load

Status: a promise continuation alone does not reproduce the immediate second-render
advantage. No production code changed; this is diagnostic instrumentation.

## Hypothesis and method

The consecutive-render diagnostic showed a faster second invocation, which also
ran after an await. To test that scheduling difference without rendering twice,
insert `await Promise.resolve()` before the single render invocation. Record this
yield separately, then retain the invocation and post-return timer boundaries.
If execution in a promise continuation explains the second-render advantage,
the invocation should approach approximately 44 to 45 microseconds for eXact and
35 to 36 for React. This is a diagnostic expectation, not a performance guarantee.

The scratch worker derives from `http-invocation-trace-2026-09-10.md`. Both isolated
loops and HTTP rendering use the same added yield. The other procedures remain:
four fresh production Node 26.8.1 workers in eXact, React, React, eXact order;
ten seconds of HTTP warmup; isolated before/after captures with 10,000 warmup and
10,000 measured iterations each; five-second HTTP windows with two fresh drivers
at concurrency 16 each. Processes run below normal priority, without concurrent
builds, tests, or profiling. User PC workload may vary.

## Results

All times are mean microseconds per invocation. RPS is instrumented diagnostic
throughput, not an updated framework benchmark baseline.

| Worker  | HTTP pre-render yield | HTTP invocation | HTTP post-return |    RPS |
| ------- | --------------------: | --------------: | ---------------: | -----: |
| eXact 1 |                 2.617 |          54.710 |            1.617 |  8,233 |
| React 1 |                 2.229 |          39.604 |            0.230 | 10,536 |
| React 2 |                 2.288 |          40.278 |            0.223 | 10,218 |
| eXact 2 |                 2.523 |          53.027 |            1.707 |  8,402 |

Isolated invocation means range from 22.504 to 23.442 microseconds for eXact and
22.932 to 25.355 for React. Isolated pre-render yield takes 0.106 to 0.131 for
eXact and 0.136 to 0.149 for React. The HTTP invocation remains close to the earlier
single-render diagnostic (eXact 53.105 to 55.719, React 38.995 to 42.127), rather
than the faster immediate second invocation. Captures use different process
populations and wall-clock periods, so this is not a precise paired effect size.

The four HTTP windows contain 187,120 valid responses and zero errors, excluding
warmups, isolated loops, and preflights. Complete documents remain 4,672 bytes for
eXact and 3,660 for React. All isolated output byte counts match HTTP identities.
The runner verifies canonical artifact hashes and unchanged server/adapter build
inventories. All owned processes close; only the user's Codex Node remains.

## Interpretation

Do not interpret the smaller post-return interval as eliminated cost. Much of it
now appears before invocation. The added yield does not account for the roughly
14-microsecond improvement from rendering a second time inside an eXact request.
This narrows the explanation but does not establish a cache, allocation, GC, or
CPU scheduling mechanism. Timers measure elapsed intervals, not exclusive CPU.

Next isolate fresh response production and output from renderer execution. A
diagnostic may still render the complete tree per request while sending an
identity-checked pre-encoded copy of the deterministic fixture document. That
would test the contribution of fresh output encoding and associated allocation
pressure; it must be labeled as a diagnostic and never reported as framework SSR
throughput. Account explicitly for any byte-counting reads that already force the
fresh string to be consumed before response.end, so the ablation tests what it
claims. Keep normal framework benchmarks fully rendered per request.

The adjacent archive preserves runner, worker, log, raw capture, summary, participant
artifacts, and a verified SHA-256 manifest. No production improvement or package/
browser acceptance is claimed.
