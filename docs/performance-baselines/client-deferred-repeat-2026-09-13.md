# Deferred root preparation client repeat, September 13, 2026

This repeats [the first deferred-root capture](client-deferred-2026-09-13.md) with unchanged
framework source and the same settings: five frameworks, 30 browser samples after warmup,
ten startup samples at each of 1x/4x/6x CPU throttling, and five heap samples per framework.
Both shared 35-test browser correctness runs passed.

The repeat does not establish a reliable reduction in tails. eXact FCP p95 returned to 52 ms,
while p99 remained 52 ms. Navigation p95/p99 increased from 30.1/30.4 to 33.1/34.1 ms.
Optimistic feedback p95 remained 1.9 ms and p99 increased from 2.0 to 2.1 ms. With 30 samples,
nearest-rank p99 is the maximum observation. Shared-PC variation limits causal interpretation.

## eXact comparison

| Metric                        | First mean | Repeat mean | First p95 | Repeat p95 | First p99 | Repeat p99 |
| ----------------------------- | ---------: | ----------: | --------: | ---------: | --------: | ---------: |
| Navigation completion (ms)    |     27.653 |      28.243 |    30.100 |     33.100 |    30.400 |     34.100 |
| First contentful paint (ms)   |     41.600 |      42.400 |    48.000 |     52.000 |    52.000 |     52.000 |
| Optimistic feedback (ms)      |      1.610 |       1.613 |     1.900 |      1.900 |     2.000 |      2.100 |
| Authoritative settlement (ms) |     13.833 |      13.993 |    15.100 |     15.500 |    15.200 |     15.700 |
| Warm browser used heap (MB)   |      2.501 |       2.501 |     2.501 |      2.501 |     2.501 |      2.501 |

## All framework results

| Metric                        | Framework      |   Mean |    p95 |    p99 |
| ----------------------------- | -------------- | -----: | -----: | -----: |
| Navigation completion (ms)    | Exact          | 28.243 | 33.100 | 34.100 |
| Navigation completion (ms)    | React          | 36.387 | 44.500 | 52.600 |
| Navigation completion (ms)    | SvelteKit      | 29.887 | 32.700 | 35.200 |
| Navigation completion (ms)    | Nuxt           | 39.617 | 42.700 | 43.800 |
| Navigation completion (ms)    | TanStack Start | 47.707 | 50.600 | 51.200 |
| First contentful paint (ms)   | Exact          | 42.400 | 52.000 | 52.000 |
| First contentful paint (ms)   | React          | 44.667 | 52.000 | 52.000 |
| First contentful paint (ms)   | SvelteKit      | 40.933 | 44.000 | 48.000 |
| First contentful paint (ms)   | Nuxt           | 43.200 | 52.000 | 52.000 |
| First contentful paint (ms)   | TanStack Start | 41.333 | 44.000 | 48.000 |
| Optimistic feedback (ms)      | Exact          |  1.613 |  1.900 |  2.100 |
| Optimistic feedback (ms)      | React          |  1.487 |  2.100 |  2.100 |
| Optimistic feedback (ms)      | SvelteKit      |  1.383 |  1.700 |  2.000 |
| Optimistic feedback (ms)      | Nuxt           |  1.057 |  1.200 |  1.200 |
| Optimistic feedback (ms)      | TanStack Start |  1.570 |  1.800 |  2.200 |
| Authoritative settlement (ms) | Exact          | 13.993 | 15.500 | 15.700 |
| Authoritative settlement (ms) | React          | 13.543 | 14.700 | 15.300 |
| Authoritative settlement (ms) | SvelteKit      | 13.817 | 15.000 | 15.200 |
| Authoritative settlement (ms) | Nuxt           | 14.110 | 15.700 | 15.800 |
| Authoritative settlement (ms) | TanStack Start | 13.850 | 15.200 | 15.200 |
| Warm browser used heap (MB)   | Exact          |  2.501 |  2.501 |  2.501 |
| Warm browser used heap (MB)   | React          |  2.303 |  2.303 |  2.303 |
| Warm browser used heap (MB)   | SvelteKit      |  2.078 |  2.078 |  2.078 |
| Warm browser used heap (MB)   | Nuxt           |  2.334 |  2.334 |  2.334 |
| Warm browser used heap (MB)   | TanStack Start |  2.758 |  2.758 |  2.758 |

## Evidence

The [structured report](client-deferred-repeat-2026-09-13.json) links browser, startup, and heap
captures with SHA-256 identities. Artifact hashes agree across those three measurement modes.
The maintained source files were verified against the preceding capture's source snapshot.
The [evidence archive](client-deferred-repeat-2026-09-13-evidence.zip) retains runners, logs, raw
captures, source identities, prior chart payloads, and desktop/mobile chart verification.

The docs typecheck and build passed, and rendered chart tables were checked against their source
values at desktop and mobile sizes. The heap chart's intentional horizontal scrolling was verified.
Client charts now use this repeat; SSR charts and their source identities are unchanged.
