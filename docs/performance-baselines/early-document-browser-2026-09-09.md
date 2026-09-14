# Browser performance after early document publication

The shell-before-hydration change did not produce a measurable paint or readiness improvement in
this workload. This actual-streaming benchmark supersedes the earlier resource-discovery smoke test
as evidence about browser performance. The smoke test still demonstrates that resource requests
can overlap a deliberately delayed hydration response; it does not establish a normal-load speedup.

## Method

- Chromium, production mode, actual server rendering through each framework's streaming API on
  every navigation. No artificial delay before hydration and no replay of a pre-rendered document.
- Preserved eXact build, current early-shell eXact build, and React. Identical eXact client assets
  isolate the server publication change. Each application renders its complete document shell.
- The same Node HTTP forwarding loop for all three renderers, respecting write backpressure.
  This isolates browser behavior under the different renderer publications rather than comparing adapters.
- 50 measured sessions per build per profile, plus one warmup each: 300 measured sessions total.
  Fresh browser contexts, disabled cache, and rotating participant order.
- Local profile: default CPU and local networking. Constrained profile: CDP 4x CPU slowdown,
  40 ms configured latency, and 10 Mbps upload/download throughput. Emulation is not a physical device.
- The normal controlled-service claim interaction verifies optimistic feedback and settlement.
  Readiness means the application's "Live service" status becomes visible, including connection setup.
  Navigation means the load-event duration; it is not hydration readiness.

Every served document matched its recorded complete byte/hash identity. Old and new eXact documents
and all their client assets matched exactly. All 300 sessions completed without browser errors or
failed requests, and their post-interaction semantic hashes matched. Evidence records 102 document
requests per build, including the two warmups.

## Mean timings

All values are milliseconds. Lower is better.

| Profile     | Metric     | Previous eXact | Early-shell eXact |  React |
| ----------- | ---------- | -------------: | ----------------: | -----: |
| Local       | FCP        |          42.56 |             43.36 |  44.72 |
| Local       | LCP        |          42.56 |             43.36 |  44.72 |
| Local       | Readiness  |          50.34 |             50.41 |  50.77 |
| Local       | Navigation |          29.24 |             29.09 |  35.90 |
| Constrained | FCP        |         240.48 |            241.52 | 242.72 |
| Constrained | LCP        |         240.48 |            241.52 | 242.72 |
| Constrained | Readiness  |         467.93 |            470.98 | 470.13 |
| Constrained | Navigation |         318.38 |            319.07 | 349.67 |

FCP and LCP coincided in this fixture. They are reported separately because both were collected.
The raw report also includes medians, p95, CSS discovery, response timing, memory, long tasks,
optimistic feedback, and settlement measurements.

## Interpretation

Paired differences compare old and new eXact in the same measurement round. Approximate 95%
intervals for their mean differences include zero for FCP, LCP, and readiness in both profiles:

| Profile     | Metric    | New minus old | Approximate 95% interval |
| ----------- | --------- | ------------: | ------------------------ |
| Local       | FCP / LCP |         +0.80 | -0.83 to +2.43           |
| Local       | Readiness |         +0.08 | -0.99 to +1.14           |
| Constrained | FCP / LCP |         +1.04 | -1.67 to +3.75           |
| Constrained | Readiness |         +3.05 | -2.18 to +8.29           |

These normal-approximation intervals summarize this run's variation, not a guarantee about other
machines, applications, or networks. This run establishes neither a browser speedup nor a regression.

The CSS request began after the document response finished in every measured session, including
the new build. Mean CSS request start was 4.29 versus 4.30 ms locally, and 74.25 versus 75.04 ms under
constraints. The new publication boundary did not create observable resource-fetch overlap in this
small-document workload. Do not extrapolate a real-world gain from the earlier artificial 200 ms hold.

Flushing the head before body traversal or task settlement remains a separate, unfinished change.
That earlier boundary may create more useful overlap, but this experiment does not prove its benefit.

[Raw samples, summaries, and artifact identities](early-document-browser-2026-09-09.json) and the
[reproduction evidence](early-document-browser-2026-09-09-evidence.zip) preserve this focused run.
The public full-suite charts remain the preserved post-shell capture; this focused experiment does
not replace them or mix streaming browser results into their string-rendered browser lane.
