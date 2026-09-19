# Final WSL workspace capture after the hydration-slot optimization, September 19, 2026

This full capture measures the repository implementation through workspace-resolved compiler, runtime, and adapter packages. Source revision: `9e6268b377b207f618df291ca6b30d7c2644bdff` plus the recorded worktree patch. Package release target: 0.6.0; component and render-program ABI: 2.

The [September 18 WSL capture](wsl-framework-2026-09-18.md) loaded published 0.5.1 packages instead of the branch. Its numbers remain evidence for that installed setup, but its branch attribution is withdrawn. The dependency ranges and release-manifest inventory are corrected. Build and measurement guards now reject shadowing registry copies, and SSR environment records retain actual resolved paths and versions.

Environment: linux 6.18.40.1-microsoft-standard-WSL2; AMD Ryzen 7 8745HS w/ Radeon 780M Graphics; 16 logical CPUs; 12.6 GiB RAM; Node v26.9.0; Bun 1.4.2.

All five controlled participants are included in browser and string SSR measurements. Streaming covers eXact, React, and TanStack Start. The separate native track covers eXact and React. Browser timing uses 30 samples; startup uses ten samples at each of 1x/4x/6x CPU throttling; heap uses five samples. SSR diagnostics use 500 sequential requests, 500 16-request waves, and one 1,000 ms c32 diagnostic window. Native measurements retain seven samples. Sustained comparisons use all twelve original Windows plans with two independent drivers and reversed framework order.

## Sustained throughput and eXact/React ratios

At total concurrency 32, RPS counts valid completed responses and divides by the union of simultaneous driver spans, summed over both populations and including drain. A ratio above 1 favors eXact. The ratio change treats React as the environment control, as requested; it is not a direct percentage change in eXact RPS.

Reference: [Workspace before hot-spot fixes](wsl-workspace-2026-09-19.md).

| Runtime/API | Loading   | eXact RPS | React RPS | eXact/React | Reference ratio | Ratio change |
| ----------- | --------- | --------: | --------: | ----------: | --------------: | -----------: |
| node/string | preloaded |    13,363 |    10,408 |      1.284× |          1.120× |       +14.6% |
| node/string | normal    |     3,213 |     2,659 |      1.208× |          1.270× |        -4.9% |
| node/stream | preloaded |    10,051 |     4,030 |      2.494× |          2.952× |       -15.5% |
| node/stream | normal    |     3,109 |     1,919 |      1.620× |          1.568× |        +3.3% |
| bun/string  | preloaded |    12,456 |    11,015 |      1.131× |          1.086× |        +4.2% |
| bun/string  | normal    |     4,398 |     4,203 |      1.046× |          0.994× |        +5.2% |
| bun/stream  | preloaded |     6,734 |     6,907 |      0.975× |          0.973× |        +0.1% |
| bun/stream  | normal    |     3,831 |     3,897 |      0.983× |          0.974× |        +0.9% |

## Browser experience

Each cell is mean / p95 / p99. Latency and memory: lower is better.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 25.857 / 40.600 / 41.500 | 38.403 / 51.600 / 59.100 | 26.227 / 31.000 / 35.200 | 36.643 / 45.200 / 48.000 | 55.613 / 71.300 / 71.500 |
| First contentful paint   | ms   | 51.067 / 72.000 / 72.000 | 51.600 / 68.000 / 84.000 | 40.000 / 48.000 / 56.000 | 38.400 / 52.000 / 52.000 | 51.867 / 68.000 / 68.000 |
| Optimistic feedback      | ms   |    1.943 / 2.800 / 3.900 |    1.877 / 2.900 / 4.500 |    1.757 / 3.400 / 3.600 |    1.310 / 1.800 / 2.400 |    1.870 / 3.100 / 3.200 |
| Authoritative settlement | ms   | 12.930 / 13.600 / 13.700 | 12.307 / 13.300 / 13.300 | 12.580 / 13.800 / 15.200 | 13.117 / 14.100 / 14.900 | 12.907 / 14.600 / 14.600 |
| Warm browser used heap   | MB   |    2.515 / 2.517 / 2.517 |    2.300 / 2.302 / 2.302 |    2.075 / 2.077 / 2.077 |    2.332 / 2.333 / 2.333 |    2.761 / 2.821 / 2.825 |

## SSR completion tails

Completion of a 16-request wave, including data loading. Cells are mean / p95 / p99 milliseconds.

| Runtime/API |                Exact |                React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | -------------------: | -------------------: | --------------------: | --------------------: | --------------------: |
| node/string | 7.39 / 10.56 / 13.54 |  6.55 / 9.32 / 12.36 | 11.04 / 15.15 / 18.94 | 15.25 / 19.89 / 24.96 | 12.86 / 17.63 / 20.79 |
| bun/string  |   5.58 / 7.23 / 8.30 |   5.57 / 7.11 / 8.05 |    5.93 / 8.02 / 9.80 |  8.51 / 12.46 / 14.02 |  7.42 / 11.64 / 12.66 |
| node/stream | 7.67 / 10.37 / 12.34 | 8.45 / 11.38 / 13.61 |           unavailable |           unavailable | 13.34 / 17.33 / 22.05 |
| bun/stream  |   5.71 / 7.30 / 8.64 |   5.64 / 7.15 / 8.11 |           unavailable |           unavailable |  9.30 / 13.91 / 16.23 |

## Scheduled offered load

Errors, drain time, and missed arrivals remain part of the reported results.

| Runtime/API | Framework | Offered RPS | Valid RPS, populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | ---------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |          7,999 / 7,955 |              0 |             900 |
| node/string | exact     |      10,000 |          9,861 / 9,861 |              0 |            5524 |
| node/string | react     |       8,000 |          7,893 / 7,781 |              0 |            5156 |
| node/string | react     |      10,000 |          8,244 / 8,317 |              0 |           67516 |
| node/stream | exact     |       8,000 |          7,999 / 7,885 |              0 |            2304 |
| node/stream | exact     |      10,000 |          9,821 / 9,734 |              0 |            8551 |
| node/stream | react     |       8,000 |          3,923 / 3,793 |            850 |          163846 |
| node/stream | react     |      10,000 |          3,794 / 3,799 |            850 |          246450 |
| bun/string  | exact     |       8,000 |          7,998 / 7,999 |              0 |              14 |
| bun/string  | exact     |      10,000 |          9,999 / 9,996 |              0 |              12 |
| bun/string  | react     |       8,000 |          7,999 / 7,997 |              0 |               8 |
| bun/string  | react     |      10,000 |          9,296 / 8,917 |              0 |           34540 |
| bun/stream  | exact     |       8,000 |          6,019 / 6,046 |              0 |           77582 |
| bun/stream  | exact     |      10,000 |          6,006 / 6,109 |              0 |          156501 |
| bun/stream  | react     |       8,000 |          6,731 / 6,594 |              0 |           52477 |
| bun/stream  | react     |      10,000 |          6,687 / 6,755 |              0 |          130040 |

Total request errors across capacity stages, including warmup: 1700. Invalid responses: 0.

## Hot-spot findings and retained change

Document composition had added a whole-HTML `includes()` search for the hydration slot to every
hydratable string result. For ordinary output without an explicit slot, that search flattened the
plain HTML rope before hydrated output was assembled. The Node allocation profile attributed about
3.36 MB across 1,000 fixture renders to that search. Six alternating isolated string-render rounds
with only the unnecessary search removed preserved identical HTML and improved median throughput
8.8% on Node and 7.6% on Bun.

The retained fix carries the renderer's existing slot knowledge into completed string results.
Explicit document slots keep their placement. Output extensions and foreign string results retain
content-based detection because their markup can change independently of the renderer. Plain HTML
still excludes internal slot markers, and hydration insertion across chunk boundaries remains intact.
The public API, hydration format, and ABI epoch are unchanged.

A second experiment moved the prepared-program symbol brand outside its object literal. It improved
isolated Node string rendering, but the [intermediate full capture](wsl-optimized-2026-09-19.md)
showed a weaker Node preloaded streaming ratio. A focused HTTP control ran the original and combined
bundles in original/combined/combined/original order, retaining two framework-order populations per
run. Mean eXact/React ratios were 2.794x for the original and 2.718x for the combination, a 2.7%
decline. Separate one-change controls reached 3.017x for slot provenance alone and 2.945x for the
allocation experiment alone. These controls did not establish a stable benefit for shipping both
changes, so the allocation experiment was removed. The final server bundle matched the slot-only
control byte for byte, and the entire framework benchmark matrix was rerun after that decision.
The [intermediate evidence archive](wsl-optimized-2026-09-19-evidence.zip) preserves the profiles,
control runners, before/after bundles, and raw results.

Using the eXact/React ratio as the comparison signal, the retained change's target improves 14.6%
on Node preloaded string rendering and 4.2% on Bun. Results are not uniformly better: Node normal
string falls 4.9%, and Node preloaded streaming falls 15.5%. Those measured regressions remain
unresolved; the controls do not establish a safe additional code change that fixes them. Bun
streaming is approximately flat. Hydration validation, serialization, and component execution also
remain prominent profile costs. Their correctness checks were retained rather than weakened for
throughput.

## Unrelated findings

The locally installed npm 12 emits a different `npm pack --json` shape from the repository-pinned
npm 11.6.4, which the existing package-content checker expects. Validation uses the pinned npm
version; changing that checker is outside this performance work. Dependency installation also
reported one moderate audit finding. Neither issue was changed as part of the hot-spot fix.

## Correctness and evidence

Validation passed: 458 SSR tests, 94 comparison-harness tests, 124 build-script tests, test typechecking,
focused lint and formatting, source-architecture and platform-boundary checks, and the publication
preflight using npm 11.6.4. The version planner's 11 tests also passed from a temporary tree containing
only source scripts and the external `semver` dependency, with no workspace packages or generated
outputs. The docs application passed typechecking and its production build. Desktop and mobile browser
checks verified all 17 distribution tables, five heap rows, and four capacity groups against the
published values, without page errors or horizontal overflow. All 3,180 measured source files were
unchanged when verified after measurement; the comparison README was updated afterward.

Both runtimes passed 35 string and 21 streaming browser contracts before timing. The native track passed all eight contracts. Native timing, startup CPU profiles, allocation captures, heap composition, raw response samples, and per-driver results remain separate evidence.

The [structured capture](wsl-optimized-final-2026-09-19.json) links all raw captures and records hashes, source state, exact runners, execution journal, and prior chart values. The [evidence archive](wsl-optimized-final-2026-09-19-evidence.zip) retains the source patch, added implementation files, logs, load plans, and documentation verification. Native samples are in [the native capture](wsl-optimized-final-2026-09-19-native.json).
