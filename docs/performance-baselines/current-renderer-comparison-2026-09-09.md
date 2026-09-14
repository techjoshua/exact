# Current retained renderer comparison after shell and marker improvements

Date: 2026-09-09. Overall React parity remains unmet.

The current eXact build includes direct server map carriers, compiled empty external scripts with
preserved client item boundaries, and shared UTF-8/hex marker encoding, as well as earlier retained
optimizations. The frozen artifact marker-hex-current.mjs matches the built Node participant exactly:
SHA-256 b8a3bd6ec50d504280de2b86f9a8b20ca250f2b7a345d8a4980a492ff12efd5f.

## Method

Forty-eight fresh processes compare eXact and React on Node 26.8.1 and Bun 1.4.2, string and consumed
stream rendering, with two reversed-order pairs per cell. Scenario order also reverses. Every
population uses NODE_ENV=production, 5,000 warmups, and 12,000 measured renders. Both frameworks
construct complete application-owned documents from identical input/options.

- empty: three incidents, no client asset tags.
- assets: three incidents, two module scripts and two stylesheet links.
- large: 96 incidents, the same four asset tags.

The same Node-target participant artifact is used on both runtimes for each framework. Streams
are consumed with Response.text(). This measures renderer completion, not the actual HTTP adapters,
socket throughput, early-shell latency, asset downloads, or browser performance. The prior HTTP
comparison remains a separate historical capture; no RPS claims are derived from these timings.

All populations completed. The worker checks full-document framing and asset presence where
applicable. Repeated populations preserve each framework's full-body hash. Framework hashes are
not expected to match each other because their hydration/markup differ. No result was discarded.

## Median microseconds per render

Lower is better. Positive time difference means eXact took longer. These are descriptive medians
of two local populations, not confidence intervals. The Node empty-string and several Bun small
populations varied substantially; raw observations are included.

| Runtime | Output | Fixture |  eXact |  React | eXact time difference |
| ------- | ------ | ------- | -----: | -----: | --------------------: |
| node    | string | empty   |  38.09 |  25.17 |                +51.3% |
| node    | string | assets  |  50.08 |  28.13 |                +78.1% |
| node    | string | large   | 226.21 | 160.83 |                +40.6% |
| node    | stream | empty   |  61.88 |  73.90 |                -16.3% |
| node    | stream | assets  |  76.84 |  89.45 |                -14.1% |
| node    | stream | large   | 240.91 | 369.01 |                -34.7% |
| bun     | string | empty   |  36.70 |  32.97 |                +11.3% |
| bun     | string | assets  |  43.18 |  37.44 |                +15.3% |
| bun     | string | large   | 267.91 | 201.74 |                +32.8% |
| bun     | stream | empty   |  50.04 |  48.92 |                 +2.3% |
| bun     | stream | assets  |  58.32 |  58.56 |                 -0.4% |
| bun     | stream | large   | 303.11 | 266.97 |                +13.5% |

Node streaming favors eXact in every pair. String rendering favors React on both runtimes and all
fixtures. Small Bun streaming is mixed by pair; large Bun streaming favors React in both pairs.
The retained improvements have not met the overall objective.

These data should guide further work toward Node string rendering and large-document publication.
They do not isolate the causal effect of the last three improvements, because the older eXact
build was not included in this capture. Do not compare absolute values across captures as if
workstation load were constant, or multiply earlier improvement percentages into this table.

No production code changed for this measurement. Prior implementation validation is documented
in direct-map-2026-09-09.md, compiled-script-2026-09-09.md, and marker-hex-2026-09-09.md, including
core/SSR/native tests and 56 browser checks. This run adds renderer output checks, not a new browser
suite or public full-benchmark baseline. Public charts remain unchanged. All benchmark subprocesses
exited; a final process inventory found only the unrelated Codex CLI Node process.

The evidence archive includes frozen artifacts, fixed data, runner/worker, raw populations,
reporter, dependency versions, and hashes. Reproduction requires the locked workspace dependencies.
