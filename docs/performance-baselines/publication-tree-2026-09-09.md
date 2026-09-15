# Incremental publication through compiled document trees

Date: 2026-09-09. Experimental renderer integration, production unchanged.

This tests whether the previous sink-only improvement survives actual compiler-generated component
execution, task settlement, resumption capture, hydration serialization, and complete document
collection. The hypothesis is that its benefit grows with component output volume, while task
and hydration costs can dominate small documents.

The small fixture has two scheduled children. The large fixture is independently compiled from
TSX containing 96 scheduled children. Five render programs become 108 staged operations in the
large fixture. Both use the same shared experimental engine and existing hydration serializer;
only the byte sink differs. Task gates are settled before traversal, while the compiled task
callbacks still run and publish their state. This measures throughput, not delayed-task latency.

Each document includes its own doctype, html, head, stylesheet link, body, child contents,
hydration envelope, and closing tags. Markers are disabled. All paired complete-document hashes
match, output byte counts agree, and all children dispose once. This is not browser hydration
validation or the framework-comparison application.

The string column collects the byte sink into Buffer.concat and decodes at completion. It is a
collection control for this experiment, not the production string sink or a recommended string
implementation. The stream column enqueues into a Web ReadableStream consumed through
Response.text. It does not use HTTP sockets or a transport with enforced slow-consumer pressure.
Prior differential and cancellation tests cover the sink pressure wrapper separately.

Node 26.8.1 and Bun 1.4.2 run in production mode. Each cell has two reversed-order pairs in fresh
processes. Small: 2,000 warmups and 6,000 measured renders. Large: 1,000 warmups and 2,000 measured
renders. Every completed sample is retained. An initial small-fixture harness assertion incorrectly
required a bare html opening tag; it was corrected to accept compiler-owned attributes before
the paired run. No renderer change was needed.

Times are microseconds per complete fixture render. Positive time changes mean slower.

| Children | Runtime | Collection | Threshold bytes |     Original us |    Optimized us | Pair time changes |
| -------- | ------- | ---------- | --------------: | --------------: | --------------: | ----------------: |
| 2        | node    | string     |            2048 |     80.80-84.20 |     81.35-82.38 |    -2.15%, +0.68% |
| 2        | node    | string     |            8192 |     82.96-85.75 |     83.53-83.80 |    +0.69%, -2.28% |
| 2        | node    | stream     |            2048 |    98.83-102.55 |    99.51-101.50 |    +2.71%, -2.96% |
| 2        | node    | stream     |            8192 |     95.19-96.91 |    96.54-100.15 |    +3.35%, +1.42% |
| 2        | bun     | string     |            2048 |     36.08-37.41 |     34.13-34.23 |    -8.78%, -5.11% |
| 2        | bun     | string     |            8192 |     35.80-36.03 |     34.10-34.44 |    -4.39%, -4.75% |
| 2        | bun     | stream     |            2048 |     40.87-41.72 |     39.68-41.19 |    -4.88%, +0.77% |
| 2        | bun     | stream     |            8192 |     41.48-41.97 |     38.81-39.66 |    -5.50%, -6.44% |
| 96       | node    | string     |            2048 | 2149.80-2293.98 | 2239.87-2269.72 |    +4.19%, -1.06% |
| 96       | node    | string     |            8192 | 2170.23-2219.35 | 2199.33-2329.92 |    +4.98%, +1.34% |
| 96       | node    | stream     |            2048 | 2349.67-2545.66 | 2284.18-2285.15 |   -2.79%, -10.23% |
| 96       | node    | stream     |            8192 | 2213.06-2217.91 | 2166.76-2224.83 |    +0.53%, -2.31% |
| 96       | bun     | string     |            2048 | 1277.77-1329.53 | 1241.85-1264.48 |    -4.89%, -2.81% |
| 96       | bun     | string     |            8192 | 1287.08-1318.22 | 1239.39-1252.56 |    -2.68%, -5.98% |
| 96       | bun     | stream     |            2048 | 1310.92-1353.59 | 1352.29-1365.71 |    +3.16%, +0.90% |
| 96       | bun     | stream     |            8192 | 1322.88-1369.63 | 1271.93-1334.02 |    -3.85%, -2.60% |

The synthetic sink speedup must not be presented as a complete-renderer speedup. These measurements
include substantial scheduled-component and hydration work that the sink change cannot remove.
Retain the incremental sink as the candidate for integration, while resolving native compiler
staging, required markers, browser adoption, and public transport coverage before production
adoption. React was not measured here. The original performance objective remains incomplete.

The evidence archive includes raw timings, build scripts, transformed fixtures/runtime, both sink
implementations, collection workers, and a verified SHA-256 manifest. Built workspace packages
and the native compiler are required for reproduction.
