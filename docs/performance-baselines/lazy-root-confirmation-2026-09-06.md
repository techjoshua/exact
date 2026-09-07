# Larger interleaved confirmation, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The first-claim feedback slowdown reproduces. The large c16 server-throughput decline does not
reproduce across fresh worker populations. This followup narrows the interpretation of the
[full comparison](framework-comparison-lazy-root-2026-09-06.md) and the earlier
[lazy-root experiments](lazy-root-observation-2026-09-06.md).

Ordered samples, summaries, artifact identities, and raw-file hashes (local capture: `lazy-root-confirmation-2026-09-06.json`)
are retained with this note. Full raw reports and owning runners remain under
`.tmp/lazy-root-confirmation`, `.tmp/claim-confirmation.mjs`, and `.tmp/ssr-confirmation.mjs`.

## Claim feedback: 300 paired before/after rounds

The same frozen baseline and lazy-root JavaScript artifacts used by the initial focused experiments
were alternated through one URL. Each sample used a fresh cache-disabled Chromium 149.0.7827.55
context. Five paired warmup rounds were discarded, followed by 300 balanced rotating/reversing
pairs. The standard comparison's browser-owned click/mutation clock measured the authoritative claim
scenario. Script hashes and semantic response identity were checked for every sample. No forced GC
ran before the click; retained heap was measured afterward. Served bytes were restored on completion.
No other agent-owned benchmarks, builds, or tests ran concurrently.

| Metric                   |  Baseline mean | Lazy-root mean | Mean difference, 95% block-bootstrap interval |
| ------------------------ | -------------: | -------------: | --------------------------------------------- |
| Optimistic feedback      |      1.5287 ms |      1.6107 ms | +0.0820 ms [+0.0507, +0.1147]                 |
| Authoritative settlement |     13.6167 ms |     13.6913 ms | +0.0747 ms [-0.0347, +0.1803]                 |
| Navigation               |     29.5390 ms |     29.6070 ms | +0.0680 ms [-0.1493, +0.2847]                 |
| First paint              |     43.3200 ms |     43.3067 ms | -0.0133 ms [-0.5867, +0.5733]                 |
| Post-GC used heap        | 2,500,563.92 B | 2,480,502.48 B | -20,061.44 B [-20,247.25, -19,912.60]         |

The primary feedback mean increased 5.36%, with a ratio interval of +3.29% to +7.54%. Median
feedback remained 1.5 ms and p95 remained 1.9 ms; p99 increased from 2.1 to 2.4 ms. The direction was
positive in all six consecutive 50-pair blocks. These intervals resample ten-pair consecutive blocks
10,000 times, retaining pairing and some local drift rather than treating every sample as independent.
They are conditional on this workload and workstation. Other timing metrics do not establish a change.

This is a real tradeoff: about 20 KB less retained heap and the previously reproduced faster repeated
filtering accompany approximately 82 microseconds more mean first-claim feedback latency. The repeat
does not establish the mechanism of that slowdown, nor imply that all interactions slow down.

## Node SSR: fresh worker populations

The server artifacts are identical to the full comparison; eXact's artifact is also identical to the
preceding published capture. There is no changed server implementation to compare for lazy root
observation. This portion instead tests the stability of the reported cross-framework throughput.

Four independent populations started all five framework workers concurrently, rotating participant
order between populations. Each used the existing SSR measurement functions, ten sequential warmups,
a two-second c32 capacity prime, 75 c16 request waves, and 40 sustained 100 ms windows at each of c16
and c32. That yields 300 c16 waves and 160 sustained windows per concurrency per framework. Samples
were interleaved within every population. Artifact hashes were checked against the full capture,
response identity was validated by the existing collector, and every worker was stopped before the
next population. Client connections and the service were closed by their owners.

| Mean throughput       |        eXact |        React | eXact / React |
| --------------------- | -----------: | -----------: | ------------: |
| c16 request waves     | 2,019.23 RPS | 2,068.22 RPS |        0.9763 |
| c16 sustained windows | 2,329.71 RPS | 2,386.41 RPS |        0.9762 |
| c32 sustained windows | 2,386.70 RPS | 2,412.95 RPS |        0.9891 |

eXact's c16-wave means by population were 2,010.09, 2,000.06, 2,084.28, and 1,982.49 RPS. React's
were 2,033.91, 2,095.78, 2,055.87, and 2,087.33. The earlier full capture measured 1,599.36 RPS for
eXact versus 2,119.83 for React; that large gap did not recur in any of these four populations.
The preceding public capture's eXact value was 2,065.42 RPS.

The observed pooled c16 gap is about 2.4%, and c32 about 1.1%. Per-round block intervals in the JSON
are conditional on these four populations; they do not independently estimate uncertainty over all
possible process placements. The results demonstrate substantial run/population sensitivity, not its
specific cause, and do not justify attributing the earlier server decline to the lazy-root change.

This focused followup is retained separately from the complete public chart capture. It does not
silently replace a subset of that capture or mix these partial lanes with its older remaining rows.
No runtime code changed during confirmation.
