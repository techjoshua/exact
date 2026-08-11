# Compiler-planned component execution performance — 2026-08-10

## Scope

This record closes the performance acceptance criterion in
[`compiler-planned-component-execution.md`](../history/compiler-planned-component-execution.md).
It measures the delivered execution model after its root-plan cache, request-allocation reductions,
streaming fast paths, static-server hoisting, and behavioral corrections. Those changes are part of
the feature's final implementation because they correct costs or behavior introduced or exposed by
the original execution-model work.

This is a current production-shaped snapshot, not a causal before-and-after comparison. The older
framework baseline predates both the model and later fixture changes, so comparing its unlike
workloads or bundle artifacts would overstate precision.

## Environment and method

The tracked
[`javascript-framework.json`](javascript-framework.json) baseline was regenerated after a fresh
repository build with five isolated process samples and two warmups per process. The warmups ensure
the planned scenario measures reuse of the root execution blueprint rather than only cold cache
construction.

- Commit: `9874e067ec8a682cf9a4440ee53cc8fb40011246` with documented working-tree
  changes.
- Runtime: Node.js 24.11.1 on Windows 10.0.26200.
- Processor: AMD Ryzen 7 8745HS.
- Browser: Chromium 149.0.7827.55.
- Commands: `npm run build` and
  `npm run benchmark:framework -- --output=docs/performance-baselines/javascript-framework.json`.

The planned workload renders 64 compiled leaves. Each leaf owns one blocking setup continuation
with an explicit prop input port and state output port. This exercises cached root-plan lookup,
availability-aware continuation issue, bounded request scheduling, publication, and final SSR
rendering. The async CPU workload also uses ordinary compiler-authored task syntax so its input is
captured once per generation; the obsolete hand-authored runtime fixture repeatedly read a reactive
prop inside its hot loop and did not measure the compiled execution model.

## Current server results

| Scenario                     | Workload                       |    Median |       p95 |                            Relevant memory or output |
| ---------------------------- | ------------------------------ | --------: | --------: | ---------------------------------------------------: |
| Planned SSR                  | 64 planned continuation leaves | 11.178 ms | 12.301 ms | 5,632,280 B transient; 58,352 B retained; 704 B HTML |
| Synchronous SSR              | 500 ordinary leaves            | 17.099 ms | 19.413 ms |                                        36,447 B HTML |
| Async CPU SSR                | 100,000 captured iterations    |  1.090 ms |  1.890 ms |                                            63 B HTML |
| Async I/O SSR                | Three siblings with 4 ms delay | 44.843 ms | 46.044 ms |                                           245 B HTML |
| Progressive SSR, first chunk | One delayed task               |  0.521 ms |  0.719 ms |                                836 B complete stream |
| Progressive SSR, complete    | One delayed task               | 13.702 ms | 29.789 ms |                                836 B complete stream |

The rows describe different workloads and must not be interpreted as relative speedups. The planned
row is the direct execution-model guard; the surrounding rows establish that ordinary, async, and
progressive server paths remain operational in the same complete run.

## Current browser counter-metrics

The same complete Chromium run records the client paths that share component ownership, reactive
publication, and cleanup machinery with client-side continuation execution.

| Scenario          |   Median |      p95 |
| ----------------- | -------: | -------: |
| Dynamic mount     | 2.000 ms | 4.100 ms |
| Hydration         | 0.100 ms | 0.200 ms |
| First interaction | 0.100 ms | 0.100 ms |
| Scalar update     | 0.000 ms | 0.000 ms |
| Branch update     | 0.100 ms | 0.100 ms |
| Keyed-list update | 7.000 ms | 8.700 ms |

The browser mount/unmount heap workload retained a median 13,264 B and p95 17,580 B after cycles
of 200 mounted components. These are regression counter-metrics for the shared client machinery,
not a claim that every row invokes a compiled async continuation.

## Shipping application memory results

The manually run shipping stress guard performed 100 warmups followed by five batches of 200
requests, forcing full garbage collection between observations. Every batch ended with zero live
component instances and zero live effect scopes.

| Observation                              |                             Result |
| ---------------------------------------- | ---------------------------------: |
| Post-warmup retained heap                |                       63,287,168 B |
| Final retained heap after 1,000 requests |                       60,866,064 B |
| Net retained growth                      |                       -2,421,104 B |
| Sampled allocation per request           |                     3,450,703.76 B |
| Allocation guard                         | Passed the 5.5 MiB/request ceiling |

The retained sequence was 64,789,688 B, 62,266,352 B, 61,432,880 B, 61,092,120 B, and
61,069,384 B. It trends toward a plateau rather than accumulating per request. A non-positive final
delta cannot prove that the engine performs no allocation; it demonstrates that the framework's
request-owned components and scopes are released and that no monotonic retained-heap contribution
was observed across this run.

The reproduction commands are:

```sh
npm run test:heap -w @exactjs/sample-shipping-calculator -- --disableConsoleIntercept
npm run test:allocation -w @exactjs/sample-shipping-calculator -- --disableConsoleIntercept
```

## Acceptance conclusion

The current model meets the proposal's performance closure requirement on this profile: cached
planned SSR completes with bounded retained memory, the production-shaped shipping workload
plateaus over 1,000 measured requests with no surviving framework ownership, and sampled allocation
remains below its regression ceiling. Future changes should compare against the machine-local JSON
baseline and rerun both shipping guards; this record is evidence for the delivered model, not a
portable release budget.
