# Full performance capture, September 14, 2026

**Release gate blocked:** two native full-stack correctness tests failed. Controlled comparison results are complete; native timing and the PR are withheld.

This capture validates the npm metadata, published starter corrections, and SSR testing repair prepared for 0.5.1. It measures committed source 52e86fad4f175d7dc6836600e29a9d73b63b6273. The tracked source was clean before timing; unrelated untracked local output is excluded from the source snapshot.

The production comparison covers five frameworks in the client and string SSR lanes. Streaming uses the three participants with an actual streaming renderer: eXact, React, and TanStack Start. Node and native Bun run separately. Sustained capacity uses eXact and React, two independent response-validating drivers, and two populations with reversed framework order.

Client timing retains 30 samples per framework, startup ten samples at each of 1x/4x/6x CPU, and heap composition five samples per framework. Client replay stops framework servers before timing and serves captured production resources through the common delivery path. SSR diagnostics retain 500 sequential samples and 500 burst waves. Internal framework benchmarks are retained as separate diagnostics. Native full-stack timing is withheld: its acceptance run passed six tests and failed two eXact mutation/detail-update tests. This is not a fully passing release benchmark, and no PR is opened from this capture.

## Client timing

Each cell is mean / p95 / p99. Lower is better. Historical differences on this shared PC do not isolate the effect of a code change.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 28.317 / 30.300 / 30.600 | 36.170 / 38.900 / 39.400 | 29.610 / 32.000 / 32.600 | 39.490 / 41.300 / 42.100 | 47.850 / 49.900 / 50.300 |
| First contentful paint   | ms   | 42.933 / 48.000 / 48.000 | 44.933 / 52.000 / 56.000 | 39.467 / 44.000 / 44.000 | 43.733 / 52.000 / 52.000 | 42.133 / 44.000 / 44.000 |
| Optimistic feedback      | ms   |    1.603 / 1.900 / 2.100 |    1.447 / 1.600 / 1.700 |    1.400 / 1.900 / 1.900 |    1.073 / 1.300 / 1.600 |    1.523 / 1.700 / 1.800 |
| Authoritative settlement | ms   | 14.063 / 14.700 / 15.400 | 13.573 / 14.700 / 14.800 | 13.717 / 14.600 / 14.900 | 14.057 / 15.400 / 15.600 | 14.130 / 15.200 / 15.300 |
| Warm browser used heap   | MB   |    2.501 / 2.501 / 2.501 |    2.303 / 2.303 / 2.303 |    2.078 / 2.078 / 2.078 |    2.334 / 2.334 / 2.334 |    2.758 / 2.758 / 2.758 |

## Sustained SSR capacity

Total concurrency is 32. Each cell contains the two independent populations. RPS counts valid completed responses. Driver p99 is the largest of the two drivers in that population.

| Runtime | API    | Loading   | eXact valid RPS | React valid RPS |  eXact p99 ms |  React p99 ms |
| ------- | ------ | --------- | --------------: | --------------: | ------------: | ------------: |
| node    | string | preloaded | 12,349 / 12,594 |   9,274 / 9,315 |  10.13 / 5.04 | 10.93 / 10.60 |
| node    | string | normal    |   3,324 / 3,277 |   2,706 / 2,799 | 15.34 / 14.93 | 16.61 / 15.74 |
| node    | stream | preloaded |  9,926 / 10,152 |   3,986 / 4,005 | 10.78 / 11.24 | 12.54 / 11.73 |
| node    | stream | normal    |   3,031 / 2,920 |   2,003 / 2,012 | 16.72 / 17.22 | 22.56 / 21.97 |
| bun     | string | preloaded | 10,835 / 11,197 |   8,818 / 9,021 |   5.63 / 5.72 |   5.54 / 5.70 |
| bun     | string | normal    |   4,381 / 4,306 |   4,291 / 4,468 |   9.52 / 9.48 |   9.52 / 8.92 |
| bun     | stream | preloaded |   6,425 / 6,462 |   6,192 / 6,237 |   8.74 / 8.25 |   7.31 / 7.94 |
| bun     | stream | normal    |   4,247 / 4,201 |   4,272 / 4,293 | 10.38 / 10.41 |   9.63 / 9.72 |

## Offered load

Abrupt offered-load stages retain connection-growth pressure. Missed arrivals and request errors are included, including warmup errors in the total. No connection-preparation control replaces the primary results.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | -------------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |              7,982 / 7,985 |              0 |             612 |
| node/string | exact     |      10,000 |              9,886 / 9,888 |              0 |            4438 |
| node/string | react     |       8,000 |              7,996 / 7,936 |              0 |            1078 |
| node/string | react     |      10,000 |              7,999 / 8,091 |              0 |           77232 |
| node/stream | exact     |       8,000 |              7,870 / 7,903 |            147 |            4282 |
| node/stream | exact     |      10,000 |              9,171 / 9,535 |              0 |           25112 |
| node/stream | react     |       8,000 |              3,956 / 3,866 |           2232 |          160368 |
| node/stream | react     |      10,000 |              3,936 / 3,950 |              0 |          241330 |
| bun/string  | exact     |       8,000 |              7,997 / 7,996 |              0 |              18 |
| bun/string  | exact     |      10,000 |              9,908 / 9,914 |              0 |            3514 |
| bun/string  | react     |       8,000 |              7,842 / 7,720 |              0 |            7834 |
| bun/string  | react     |      10,000 |              7,749 / 7,685 |              0 |           90378 |
| bun/stream  | exact     |       8,000 |              5,940 / 5,847 |              0 |           83251 |
| bun/stream  | exact     |      10,000 |              5,845 / 5,814 |              0 |          165819 |
| bun/stream  | react     |       8,000 |              6,147 / 6,116 |              0 |           73795 |
| bun/stream  | react     |      10,000 |              6,155 / 6,147 |              0 |          153012 |

Total capacity request errors: 2379. Invalid responses: 0. Error categories are retained in the raw driver results.

## SSR completion tails

The burst metric measures completion of a 16-request wave, including data loading. Values are mean / p95 / p99 milliseconds.

| Runtime/API |                 Exact |                 React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | --------------------: | --------------------: | --------------------: | --------------------: | --------------------: |
| node/string | 10.13 / 17.96 / 23.17 |  9.32 / 18.86 / 23.29 | 10.83 / 13.61 / 14.98 | 13.45 / 16.37 / 17.12 | 12.72 / 15.58 / 16.50 |
| bun/string  |    4.59 / 5.41 / 6.03 |    4.52 / 5.24 / 6.22 |    5.16 / 6.27 / 7.48 |   7.34 / 8.94 / 11.06 |    6.68 / 8.41 / 9.43 |
| node/stream | 11.01 / 21.40 / 23.73 | 11.26 / 21.48 / 24.61 |           unavailable |           unavailable | 13.46 / 16.18 / 17.29 |
| bun/stream  |    4.81 / 5.78 / 6.42 |    4.55 / 5.25 / 5.71 |           unavailable |           unavailable |  8.29 / 10.69 / 11.83 |

## Validation and evidence

Admission retained the full workspace and native compiler builds, static checks, published-artifact ABI and package-content checks, sample builds, package/application tests, React compatibility and R3F browser matrices, Router compatibility, Theme Lab acceptance, and the native compiler corpus. The initial pass exposed pre-existing formatting and module-size violations, a version-pinned adapter assertion, and Node/jsdom storage selection in an application test. Each was corrected before timing; original failures and resumed passing checks remain in the evidence.

Vitest emitted listener-count warnings from its worker stdout/stderr piping. Traces identify the test runner rather than HTTP request sockets. These warnings are separate from offered-load connection errors.

The [structured capture](full-performance-2026-09-14.json) includes raw capture links, source and artifact identities, execution journals, internal performance results, and previous chart values. The [evidence archive](full-performance-2026-09-14-evidence.zip) retains runner scripts, validation logs, screenshots, and the failed native acceptance traces. Public performance charts are generated from this capture and checked against the raw values on desktop and mobile.

The [previous client baseline](client-deferred-repeat-2026-09-13.md) and [previous SSR baseline](ssr-audit-2026-09-13.md) remain historical evidence. Cross-capture changes require targeted controls before attribution.

## Blocking native correctness findings

The native acceptance suite passed 6 of 8 tests. Native timings were not collected and the PR is withheld. In the claim failure, the generated operation returned HTTP 200 with an incident owned by user-alex, status investigating, and version 2. The queue updated, while the selected detail still showed Unassigned, open, and Version 1. A second-session comment similarly failed to appear in the selected detail.

The [authored render helper](../../framework-comparison/participants/exact-native/src/workspace-view.tsx) derives `selected` and `owner` from component state; the generated client emits cached derived cells for these values. The precise compiler/runtime cause remains unconfirmed. The next step is a minimal compiled render-helper regression covering replacement of a selected object and observation of its dependent fields through mount and hydration. The application has not been rewritten to work around the failure.

Reproduce with `npm run test:native --workspace @exactjs/framework-comparison-suite`. The evidence archive contains the retained Playwright traces and error snapshots.

## Connection-growth control

This separate control retains the primary default renderer, adapter, two drivers, and two reverse-order populations. Immediately before offered demand, each driver increases concurrency in steps of 16 to 256, holding each step for 250 ms. All preparation-stage failures are retained. No request retries or renderer changes are used.

| Framework | Population | Preparation errors | Offered-stage errors | Invalid responses | Valid RPS at 8,000 offered | Valid RPS at 10,000 offered |
| --------- | ---------: | -----------------: | -------------------: | ----------------: | -------------------------: | --------------------------: |
| exact     |          1 |                  0 |                    0 |                 0 |                      7,999 |                       9,310 |
| react     |          1 |                  0 |                    0 |                 0 |                      3,966 |                       3,936 |
| react     |          2 |                  0 |                    0 |                 0 |                      4,024 |                       3,994 |
| exact     |          2 |                  0 |                  399 |                 0 |                      7,986 |                       9,692 |

Preparing the pool once did not eliminate errors at the subsequent demand increase. The next control tests preparation before both increases.

### Preparation before each demand stage

The first control prepared connections only before 8,000 offered RPS; one eXact population recorded 399 refusals after demand increased to 10,000. This additional control repeats the same gradual preparation immediately before both offered stages, testing whether initial preparation remains sufficient after the preceding 20-second stage. Both controls are retained separately.

| Framework | Population | Preparation errors | Offered-stage errors | Invalid responses | Valid RPS at 8,000 offered | Valid RPS at 10,000 offered |
| --------- | ---------: | -----------------: | -------------------: | ----------------: | -------------------------: | --------------------------: |
| exact     |          1 |                  0 |                    0 |                 0 |                      7,998 |                       9,621 |
| react     |          1 |                  0 |                    0 |                 0 |                      3,909 |                       3,898 |
| react     |          2 |                  0 |                    0 |                 0 |                      3,907 |                       3,915 |
| exact     |          2 |                  0 |                    0 |                 0 |                      7,996 |                       9,450 |

Preparing connections before each demand stage produced zero preparation and request errors in both populations for both frameworks. The primary abrupt-load failures remain visible. This supports a connection-growth/overload interaction and shows that one initial preparation does not guarantee an error-free later demand increase. It does not establish a defect in a framework renderer.
