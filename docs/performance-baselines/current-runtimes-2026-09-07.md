# Current runtime chart refresh: September 7, 2026

Node 26.8.1 and Bun 1.4.2 are installed as machine-wide defaults under Program Files.
The machine PATH resolves these versions; no PowerShell profile override is required.
Repository version files pin Node 26.8.1, primary CI jobs use Node 26 and Bun 1.4.2,
and the TypeScript compatibility job covers Node 24 and 26.

## Published evidence

Existing production builds were reused. All 35 five-framework browser correctness checks passed.
The five-framework SSR diagnostic capture uses 500 sequential samples, 500 sixteen-request
bursts, 100 warmups, and five retained-heap checkpoints per framework on each runtime.
Public charts label Node and Bun separately; Bun uses native Fetch transport for eXact and
Node HTTP compatibility for the other participants. Browser/Chromium evidence was not rerun
and retains its independent dates. Short-window diagnostic RPS is not published.

The Node capacity captures retain two independent driver processes, a separate fixture service,
two fresh reversed framework populations, and ten-second warmups. Preloaded concurrency
stages last fifteen seconds each; normal-loading and scheduled-demand stages last twenty seconds.
An initial concurrency capture overlapped the elevated machine installation and was discarded.
Its full replacement is the only sweep used by the public charts. No tests, builds, or profilers
overlapped the admitted timed capacity runs. All admitted capacity lanes had zero request errors.

| Total concurrency | eXact valid RPS | React valid RPS |
| ----------------- | --------------: | --------------: |
| 16                |           7,112 |           6,428 |
| 32                |           7,005 |           6,199 |
| 64                |           6,603 |           5,964 |
| 128               |           6,456 |           6,241 |

Normal-loading c32: eXact 1,927 valid RPS, React 1,945 valid RPS.

| Framework | Offered RPS | Valid RPS | Capacity misses | Request errors |
| --------- | ----------: | --------: | --------------: | -------------: |
| eXact     |       8,000 |     6,322 |          20.67% |              0 |
| eXact     |      10,000 |     6,283 |          36.92% |              0 |
| React     |       8,000 |     5,840 |          26.67% |              0 |
| React     |      10,000 |     5,882 |          40.90% |              0 |

## Why Node sequential latency differs from Bun

The Node 26 capture had about 14–15 ms mean sequential latency across all five frameworks.
eXact phase accounting attributed 13.25 ms to data loading and 0.41 ms to rendering.
A controlled follow-up used the same fixture and minimal static servers, separately owned
clients, repeated fetch/HTTP ordering, twenty warmups, and one hundred samples per lane.
The minimal static server produced:

| Client             | Mean range, ms |
| ------------------ | -------------: |
| Node 24.11.1 fetch |      0.39–0.42 |
| Node 26.8.1 fetch  |    14.12–14.41 |
| Node 26.8.1 HTTP   |      0.27–0.34 |
| Bun 1.4.2 fetch    |           0.10 |

Both Node versions showed roughly 15.5 ms medians for nominal one-millisecond timers.
That observation alone did not explain the fetch discrepancy: Node 24 fetch remained fast.
Inspection of the actual embedded Undici source found idle-socket validation in Node 26.8.1
(Undici 8.10.0), absent from Node 24.11.1 (Undici 7.16.0). It gates socket reuse on
`setTimeout(0)`. A scheduling-preserving trace observed a 13.97 ms median wait for 96 such
callbacks, alongside a 15.52 ms median for 50 measured pairs of fetch requests.
Bun uses a different fetch implementation and does not enter this Undici validation path.

[Undici PR 5606](https://github.com/nodejs/undici/pull/5606) restored the timeout because
the previous unreferenced-immediate approach could stall an otherwise idle event loop.
This is a runtime HTTP-client cost reproduced without any framework, not eXact rendering.
No framework workaround, timer replacement, or modified runtime was used in public measurements.
Node/Bun complete response latency must not be interpreted as isolated rendering speed.

## Resolver flag

No tracked repository script uses `--experimental-import-meta-resolve`. Vitest injects it
and calls the two-argument `import.meta.resolve(specifier, parentURL)` API. Node still gates
that optional second argument behind the flag; it is not safe to strip it from Vitest workers.
See [Node ESM documentation](https://nodejs.org/api/esm.html#importmetaresolvespecifier).

## Local evidence and validation

Raw captures remain local and are excluded from the commit:

- `current-runtimes-2026-09-07-multi.json`
- `current-runtimes-2026-09-07-normal.json`
- `current-runtimes-2026-09-07-arrivals.json`
- `current-runtimes-2026-09-07-ssr.json`

The focused HTTP reproduction, timer trace, process logs, and screenshots remain in
.tmp/current-runtimes. Public JSON contains the admitted summaries and capture provenance.

Validation: 91 build-script tests, 77 comparison-harness tests, and 35 browser correctness
checks passed on Node 26. Publisher coverage checks distinct Bun populations, incomplete
Bun evidence, and preservation of Bun capture provenance during a later Node-only refresh.

Documentation type checking/build, desktop/mobile chart verification, changed-file lint,
source architecture, and JSDoc checks passed. All eleven distribution tables match published
JSON on desktop and mobile, with no browser errors or horizontal overflow. The seven focused
publisher/capacity tests also pass on Node 24.20.0. No task-owned server processes remain.
