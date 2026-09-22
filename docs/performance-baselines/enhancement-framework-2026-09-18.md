# Enhancement framework comparison, September 18, 2026

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

This capture measures the document-shell, children-composition, and enhancement changes with their performance fixes. The source is the uncommitted worktree based on 056b115478acb4a390ce750b26a4c066a2ff6a63. Source hashes and the worktree patch accompany the evidence.

The production comparison covers five frameworks in the client and string SSR lanes. Streaming uses the three participants with an actual streaming renderer: eXact, React, and TanStack Start. Node and native Bun run separately. Sustained capacity uses eXact and React, two independent response-validating drivers, and two populations with reversed framework order.

Client timing retains 30 samples per framework, startup ten samples at each of 1x/4x/6x CPU, and heap composition five samples per framework. Captured-page replay stops framework servers before timing. SSR diagnostics retain 500 sequential samples and 500 burst waves. Sustained capacity uses the same plans as the September 14 baseline.

## Client timing

Each cell is mean / p95 / p99. Lower is better. Historical differences on this shared PC do not isolate the effect of a code change.

| Metric                   | Unit |                    Exact |                    React |                SvelteKit |                     Nuxt |           TanStack Start |
| ------------------------ | ---- | -----------------------: | -----------------------: | -----------------------: | -----------------------: | -----------------------: |
| Navigation completion    | ms   | 30.670 / 34.200 / 37.000 | 41.027 / 46.200 / 47.300 | 32.267 / 35.400 / 37.500 | 43.300 / 47.400 / 48.300 | 54.503 / 62.300 / 62.300 |
| First contentful paint   | ms   | 46.133 / 56.000 / 56.000 | 51.733 / 64.000 / 64.000 | 44.000 / 56.000 / 56.000 | 47.200 / 56.000 / 56.000 | 46.400 / 52.000 / 52.000 |
| Optimistic feedback      | ms   |    2.167 / 3.000 / 3.800 |    1.910 / 2.700 / 3.000 |    1.717 / 2.700 / 3.100 |    1.327 / 1.700 / 2.300 |    2.000 / 3.600 / 4.400 |
| Authoritative settlement | ms   | 13.030 / 14.900 / 15.000 | 13.023 / 14.600 / 14.700 | 13.057 / 14.700 / 14.700 | 13.400 / 14.400 / 14.400 | 13.497 / 16.300 / 16.700 |
| Warm browser used heap   | MB   |    2.532 / 2.533 / 2.533 |    2.303 / 2.303 / 2.303 |    2.078 / 2.078 / 2.078 |    2.334 / 2.334 / 2.334 |    2.760 / 2.769 / 2.822 |

## Sustained SSR capacity

Total concurrency is 32. Each cell contains the two independent populations. RPS counts valid completed responses. Driver p99 is the largest of the two drivers in that population.

| Runtime | API    | Loading   | eXact valid RPS | React valid RPS |  eXact p99 ms |  React p99 ms |
| ------- | ------ | --------- | --------------: | --------------: | ------------: | ------------: |
| node    | string | preloaded |   8,651 / 8,237 |   7,143 / 6,556 |   7.84 / 7.68 | 12.62 / 12.18 |
| node    | string | normal    |   2,130 / 2,177 |   2,022 / 2,019 | 25.49 / 24.06 | 24.64 / 24.51 |
| node    | stream | preloaded |   6,840 / 6,701 |   3,067 / 3,053 |  9.78 / 13.65 | 15.11 / 15.02 |
| node    | stream | normal    |   2,138 / 2,047 |   1,520 / 1,530 | 24.72 / 25.68 | 29.62 / 29.87 |
| bun     | string | preloaded |   8,999 / 8,926 |   7,283 / 7,046 |  11.89 / 7.64 |  12.06 / 7.25 |
| bun     | string | normal    |   3,679 / 3,656 |   3,701 / 3,630 | 13.98 / 12.74 | 11.97 / 11.90 |
| bun     | stream | preloaded |   4,929 / 5,166 |   5,106 / 5,118 | 11.83 / 10.78 |   9.34 / 9.52 |
| bun     | stream | normal    |   3,628 / 3,504 |   3,682 / 3,555 | 13.70 / 14.70 | 12.44 / 12.59 |

## Offered load

Abrupt offered-load stages retain connection-growth pressure. Missed arrivals and request errors are included, including warmup errors in the total. No connection-preparation control replaces the primary results.

| Runtime/API | Framework | Offered RPS | Valid RPS, two populations | Request errors | Missed arrivals |
| ----------- | --------- | ----------: | -------------------------: | -------------: | --------------: |
| node/string | exact     |       8,000 |              7,236 / 7,588 |              0 |           23182 |
| node/string | exact     |      10,000 |              8,029 / 7,432 |              0 |           89966 |
| node/string | react     |       8,000 |              6,006 / 5,998 |              0 |           78952 |
| node/string | react     |      10,000 |              5,949 / 6,134 |              0 |          157433 |
| node/stream | exact     |       8,000 |              5,378 / 6,046 |            649 |           90463 |
| node/stream | exact     |      10,000 |              6,138 / 6,745 |              0 |          141562 |
| node/stream | react     |       8,000 |              2,993 / 3,020 |           2877 |          195778 |
| node/stream | react     |      10,000 |              2,958 / 3,022 |              0 |          279384 |
| bun/string  | exact     |       8,000 |              7,879 / 7,917 |              0 |            4035 |
| bun/string  | exact     |      10,000 |              8,649 / 8,629 |              0 |           54035 |
| bun/string  | react     |       8,000 |              6,487 / 6,581 |              0 |           57461 |
| bun/string  | react     |      10,000 |              6,463 / 6,657 |              0 |          136538 |
| bun/stream  | exact     |       8,000 |              4,605 / 4,626 |              0 |          134322 |
| bun/stream  | exact     |      10,000 |              4,632 / 4,677 |              0 |          212921 |
| bun/stream  | react     |       8,000 |              5,043 / 5,240 |              0 |          113256 |
| bun/stream  | react     |      10,000 |              5,126 / 5,103 |              0 |          194327 |

Total capacity request errors: 3526. Invalid responses: 0. Error categories are retained in the raw driver results.

## SSR completion tails

The burst metric measures completion of a 16-request wave, including data loading. Values are mean / p95 / p99 milliseconds.

| Runtime/API |                 Exact |                 React |             SvelteKit |                  Nuxt |        TanStack Start |
| ----------- | --------------------: | --------------------: | --------------------: | --------------------: | --------------------: |
| node/string | 12.21 / 16.74 / 21.04 | 10.77 / 16.90 / 23.61 | 14.60 / 19.96 / 22.58 | 18.40 / 25.67 / 29.66 | 16.87 / 22.37 / 25.44 |
| bun/string  |    4.74 / 6.80 / 7.43 |    4.62 / 6.54 / 7.18 |    5.13 / 7.85 / 8.65 |  7.94 / 11.94 / 14.00 |  6.70 / 10.22 / 11.88 |
| node/stream | 11.43 / 18.45 / 24.80 | 12.79 / 20.44 / 25.92 |           unavailable |           unavailable | 17.14 / 22.37 / 24.47 |
| bun/stream  |   6.00 / 7.98 / 10.01 |    5.89 / 7.69 / 8.14 |           unavailable |           unavailable | 10.10 / 13.85 / 16.54 |

## Historical comparison

The previous docs charts describe the September 14 build. These captures were taken on different days and do not isolate the enhancement implementation. The paired [enhancement fixture comparison](../enhancement-performance-comparison.md) addresses that narrower question.

| eXact browser metric     | Previous mean | Current mean | Change |
| ------------------------ | ------------: | -----------: | -----: |
| Navigation completion    |        28.317 |       30.670 |   8.3% |
| First contentful paint   |        42.933 |       46.133 |   7.5% |
| Optimistic feedback      |         1.603 |        2.167 |  35.1% |
| Authoritative settlement |        14.063 |       13.030 |  -7.3% |
| Warm browser used heap   |         2.501 |        2.532 |   1.3% |

## Production client size

The controlled eXact participant has unchanged authored source size. Its complete production client artifacts grew from 63,488 to 70,778 gzip bytes (11.5%). Raw bytes changed from 206,994 to 229,856. This is a production-minified application measurement; it is distinct from the unminified dedicated enhancement fixture.

## Validation and evidence

Production Node and Bun targets passed 35 string-rendering browser contracts each and 21 streaming contracts each before measurement. Response identity, artifact identity, and load accounting are checked by the capture and publication tools. Error counts and missed arrivals remain visible.

The documentation typecheck and production build passed. Desktop and mobile browser checks verified
all 17 distribution tables, heap composition, four capacity groups, and summary values against the
generated reports, with no page errors or horizontal overflow. Chart screenshots accompany the evidence.

The [structured results](enhancement-framework-2026-09-18.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).

The separate native full-stack capture (raw capture not retained) passed all eight acceptance tests and collected seven browser samples per participant. Median readiness was 72.43 ms for eXact and 74.38 ms for React; median claim settlement was 65.65 ms and 75.49 ms respectively. This native transport track remains separate from the controlled-service charts.

The [September 14 capture](full-performance-2026-09-14.md) remains historical evidence. This is a framework benchmark refresh, not a new full release-validation run.
