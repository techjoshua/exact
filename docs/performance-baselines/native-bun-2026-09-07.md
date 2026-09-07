# Native Bun framework comparison, September 7, 2026

All five controlled-service participants now use native Bun production targets. React uses React 19
`renderToReadableStream`; SvelteKit 2 uses `svelte-adapter-bun` 1.0.1; Nuxt and TanStack Start use Nitro
with the `bun` preset. eXact retains its native Bun adapter. See the [suite workflow](../../framework-comparison/README.md#native-bun-production-targets) for adapter choices and validation commands.

The new capture supersedes the old compatibility transport population in the public Bun charts.
It does not establish a paired before/after speedup. Node and Chromium captures retain their original
data and dates. Production Bun HTML passed all 35 shared browser contracts; the existing Node
production fixtures separately passed the same 35 contracts.

## Sustained capacity

Preloaded sweep: 10 s warmup and 15 s per measured stage. Normal loading: 10 s warmup and 20 s per measured stage. Arrivals: 10 s warmup and 20 s per measured stage. Each capture uses two reversed process populations on win32, target Bun 1.4.2, Node v26.8.1 load drivers, AMD Ryzen 7 8745HS w/ Radeon 780M Graphics. Zero request errors in these captures; response identities and accounting validated.

Targets ran on Bun 1.4.2; two independent Node 26.8.1 load-driver processes counted complete native
HTTP responses. Each framework ran in its own process, with reversed order across two fresh
populations. All response identities and artifact hashes matched. Driver and server processes shared
one Windows workstation (AMD Ryzen 7 8745HS, 16 logical processors). No benchmark builds, browser tests,
or profilers were started alongside the timed capacity stages. The user's existing docs development
server remained running.

| Concurrency | eXact valid RPS | React valid RPS |
| ----------- | --------------: | --------------: |
| 16          |            9863 |            6278 |
| 32          |            9359 |            6228 |
| 64          |            9352 |            6061 |
| 128         |            8757 |            6037 |

Normal data-loading requests at concurrency 32: eXact 4222 valid RPS; React 4172 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |        8000 |      7990 |           0.08% |              0 |
| eXact     |       10000 |      8220 |          17.46% |              0 |
| React     |        8000 |      6138 |          22.98% |              0 |
| React     |       10000 |      6184 |          37.92% |              0 |

## Five-framework diagnostics

500 sequential requests and 500 sixteen-request bursts per framework, collected in balanced
interleaved rounds. Retention checkpoints run separately after explicit garbage collection. The
short-window throughput diagnostic is not published as capacity. Heap values use JavaScriptCore
accounting; Node V8 heap values are a separate population.

| Framework      | Sequential mean (ms) | Burst mean (ms) | Retained heap mean (MB) |
| -------------- | -------------------: | --------------: | ----------------------: |
| Exact          |                0.731 |           4.627 |                   3.974 |
| React          |                0.793 |           4.669 |                   4.196 |
| SvelteKit      |                0.926 |           5.241 |                   5.513 |
| Nuxt           |                1.418 |           7.590 |                  11.192 |
| TanStack Start |                1.389 |           8.642 |                   8.785 |

## Local evidence

Raw captures, logs, screenshots, and scratch runners remain local and are excluded from the PR.
The capacity archives embed the exact runner, plan, immutable artifact hashes, response identities,
worker stderr, service intervals, and bounded worker/driver telemetry. The committed public JSON
contains the validated summaries.

- multi: local `docs/performance-baselines/native-bun-2026-09-07-multi.json`, SHA-256 `694c5b4dfd3306733cc1ef0280c3b636aa3b1cd714d2a3c3935959323d4c477a`.
- normal: local `docs/performance-baselines/native-bun-2026-09-07-normal.json`, SHA-256 `637524e82d37096228f88ad64ccf20b0568555b1827bbbbaba241e887b89bc80`.
- arrivals: local `docs/performance-baselines/native-bun-2026-09-07-arrivals.json`, SHA-256 `33635628ccbd64c625b89e6175a21366c331782c7910663e61927d54a84a78a8`.
- ssr: local `docs/performance-baselines/native-bun-2026-09-07-ssr.json`, SHA-256 `d8801a437d6007e94dbb3cc317ddcba9f83a377e028ad8d8c0e5ea0f0fa0d34a`.
