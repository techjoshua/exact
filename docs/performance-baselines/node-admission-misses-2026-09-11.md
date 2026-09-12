# Node admission misses, September 11, 2026

Implemented: Node admission uses shorter adequately sampled immediate controls and a longer routine
recheck interval. The renderer, output sinks, request limits, and React implementation are unchanged.
This focused capture follows the [full benchmark baseline](v8-normalization-full-2026-09-11.md).
It does not replace the full-suite public charts.

## Cause and retained change

Traces of the previous controller show missed arrivals clustering when useful batching is disabled
for immediate-start controls. The routine five-second deadline repeatedly creates those windows.
Stable enabled periods in the first trace have no capacity misses; transitions and immediate controls
account for the observed clusters. Forced batching is a diagnostic bound, not the adopted policy.

The retained controller keeps both surrounding immediate controls and the requirement for higher
completion rate and lower lag than both. Immediate controls may end after 250 ms with at least 100
completions; otherwise they collect for up to 750 ms. Trial and enabled observation windows remain
750 ms. A successful policy receives a routine recheck after 30 seconds, while poor completion
capacity or lag still triggers earlier reassessment. Sparse traffic and idle cleanup remain immediate.

The first candidate changed only the routine deadline. It reduced misses but left long control-window
tails. The retained candidate also shortens sufficiently sampled controls. Neither candidate changes
the 256-request per-driver cap, offered rates, timeout, response validation, or request accounting.

A changing workload can still invalidate the comparison between before/trial/after windows. One
instrumented candidate population conservatively rejected such a trial and recorded a transient miss
cluster before a later trial succeeded. The policy does not promise zero misses for every workload.

## Final uninstrumented comparison

Production Node 26.8.1 on the same Windows PC with variable foreground usage. Two independent load
drivers and two reversed framework/policy orders use the same current application bundle. Only the
Node adapter differs between the old and current eXact controls. Each worker runs a 5-second warmup,
20 seconds at 8,000 offered RPS, then 12 seconds at 10,000. Earlier 40-second experiments cover the
retained routine recheck interval. Full authored documents and hydration are rendered per request;
body hashes match across old/current eXact populations. React is unchanged.

Counts below combine both populations. RPS is shown separately for each population. Percentile
ranges retain individual driver summaries; they are not pooled percentiles.

| API    | Offered RPS | Policy   | Valid RPS, two populations | Capacity misses | Capacity miss % | Other missed arrivals | Errors | Driver p95 ms  | Driver p99 ms  |
| ------ | ----------: | -------- | -------------------------: | --------------: | --------------: | --------------------: | -----: | -------------- | -------------- |
| string |       8,000 | baseline |              7,871 / 7,887 |           4,749 |          1.484% |                    14 |     29 | 68.9 to 69.5   | 71.5 to 71.8   |
| string |       8,000 | current  |              7,994 / 7,999 |              69 |          0.022% |                     6 |      0 | 12.9 to 17.2   | 32.9 to 45.0   |
| string |       8,000 | react    |              7,944 / 7,925 |           1,739 |          0.543% |                     9 |      0 | 62.9 to 64.2   | 68.7 to 71.7   |
| string |      10,000 | baseline |              9,282 / 9,293 |          16,944 |          7.060% |                     4 |      0 | 69.4 to 69.9   | 73.9 to 75.3   |
| string |      10,000 | current  |              9,994 / 9,997 |               0 |          0.000% |                    14 |      0 | 11.9 to 12.6   | 14.4 to 15.8   |
| string |      10,000 | react    |              8,043 / 7,896 |          47,692 |         19.872% |                     8 |      0 | 65.9 to 67.3   | 76.3 to 86.5   |
| stream |       8,000 | baseline |              7,285 / 7,283 |          26,833 |          8.385% |                    14 |    575 | 89.5 to 90.3   | 95.2 to 96.8   |
| stream |       8,000 | current  |              7,922 / 7,901 |           3,214 |          1.004% |                    48 |    200 | 21.6 to 32.4   | 84.2 to 86.3   |
| stream |       8,000 | react    |              3,902 / 3,915 |         160,580 |         50.181% |                    18 |   2075 | 134.4 to 135.7 | 137.6 to 139.4 |
| stream |      10,000 | baseline |              8,464 / 8,638 |          34,463 |         14.360% |                    10 |      0 | 87.2 to 88.6   | 89.4 to 91.7   |
| stream |      10,000 | current  |              9,977 / 9,971 |             450 |          0.188% |                    23 |      0 | 26.5 to 38.3   | 44.5 to 50.7   |
| stream |      10,000 | react    |              3,953 / 3,926 |         144,448 |         60.187% |                    22 |      0 | 133.4 to 135.3 | 135.6 to 138.0 |

Capacity misses are offered requests the driver never starts because its in-flight cap is full.
They are distinct from a completed response exceeding a latency budget, driver scheduling misses,
end-of-stage misses, and request errors. All errors remain in the raw capture. No invalid responses
occurred in the final captures. Successful throughput excludes errors and includes response drain.

The current final streaming capture retains 200 `ECONNREFUSED` errors during the first two seconds of the
second 8,000-RPS population (188 in the first interval, 12 in the second). The old adapter records 575 such streaming errors across both
populations, and React records 2,075. This is consistent with the previously observed connection
expansion burst, but these measurements do not establish the underlying OS cause. This change
reduces admission misses; it does not claim to solve every connection-ramp failure.

## Changing workload and lifecycle checks

The retained candidate also ran small-to-96-row-to-small documents in one live server, for string
and streaming modes. The controller changed scheduling behavior across those workloads and recovered
after idle. Twelve subsequent sparse requests in each mode used zero scheduled starts. Every
response passed full-document validation and every load stage had zero request errors. These are
workload-transition checks, not a universal large-document throughput claim.

The runtime change is confined to the Node adapter. Native Bun admission remains a separate pending
integration; its [batched-admission experiment](bun-admission-recheck-2026-09-11.md) remains diagnostic.

## Validation and evidence

All 59 Node-adapter tests pass, including count-gated lower-volume controls, rejection of misleading
capacity comparisons, early reassessment for worsening lag or throughput, sparse execution, epoch
fencing, cancellation, and cleanup. All 112 live Node/Bun string/stream browser checks pass.
The adapter was rebuilt before the final capture. Test type checking and focused ESLint passed.
Final boundary and documentation validation are recorded with the evidence.

Final source-architecture, JSDoc, compiled-artifact compatibility, platform-boundary, package-content,
docs type checks, 10 docs tests, production docs build, and desktop/mobile documentation checks pass.
The docs check also verifies the published scheduling description on the advanced page. Its initial
route-selection failure is retained in the validation journal, followed by the successful correction.

[Evidence archive](node-admission-misses-2026-09-11-evidence.zip) contains all trace and candidate
populations, uninstrumented final results, workload transitions, browser logs, validation, frozen
adapters and application bundles, source snapshots, and runners. No failed or slow population was
removed. Runners use the recorded workspace paths and installed repository dependencies.

Archive SHA-256: `ab3b7b667bec0ef67da7c92964571fd0fc8479bc8f565dafbd45708fa530da9e`.
