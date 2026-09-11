# Static server invocation experiments, September 10, 2026

Status: compiler implementation integrated into the canonical benchmark builds. The preceding
baseline is [direct server lists](direct-server-lists-2026-09-10.md).
The overall React throughput objective remains unmet.

## Hypotheses and scope

A compact entry for synchronous two-write programs could remove continuation bookkeeping
from their common path. The initial hypothesis was a 2-5% reduction in render time. Five
generated writers were transformed in an isolated artifact, preserving backpressure after
each write. Eight forced-backpressure Node/Bun document checks passed. The 72-population
screen was mixed: Node small string time changed from 33.675 to 33.44 microseconds,
Node large encoded time from 201.79 to 204.92, and Bun large string time from 211.455
to 216.03. This experiment was rejected; its duplicated continuation code is not in the compiler.

The second experiment reuses entirely literal, enhancement-free prepared server invocations.
It removes the invocation carrier, values array, and nested literal allocations from each
request. It does not cache rendered output or request ownership. Instrumentation found five
eligible sites, but only two execute in either the small or large benchmark. After that check,
the expected overall improvement was below 1%. The compiler implementation excludes dynamic
references, calls, spreads, computed keys, custom prototypes, and enhancements. Component and
structural child slots also remain request-local: a literal object passed to authored code must
not acquire shared identity merely because its initial properties are constant. Explicit
definition dependencies preserve initialization order without retaining unused render programs.

## Measurements

Each population is a fresh production Node or Bun process. Both frameworks render their complete
application-owned document with four asset tags. Small uses three incidents; large uses 96.
String measures rendering; encoded also consumes the string through Response.text(); stream
fully consumes the framework stream. These are microseconds per render, not HTTP requests/s.
Complete-document hashes match between eXact variants. React remains loaded from its actual
participant location so its package resolution is preserved.

The rebuilt candidate screen used 5,000 warmups, 12,000 measured iterations, and two reversed
variant orders. Means follow; lower is better.

| Runtime | Mode | Size | Retained eXact | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| Node | String | Small | 34.12 | 33.55 | 22.37 |
| Node | String | Large | 165.66 | 166.76 | 131.59 |
| Node | Encoded | Small | 50.94 | 49.46 | 33.57 |
| Node | Encoded | Large | 210.63 | 212.29 | 185.63 |
| Node | Stream | Small | 54.35 | 54.26 | 66.86 |
| Node | Stream | Large | 196.78 | 197.67 | 333.38 |
| Bun | String | Small | 35.84 | 36.65 | 33.30 |
| Bun | String | Large | 220.39 | 212.72 | 187.74 |
| Bun | Encoded | Small | 38.37 | 37.27 | 37.51 |
| Bun | Encoded | Large | 223.15 | 221.52 | 208.39 |
| Bun | Stream | Small | 51.98 | 51.40 | 52.94 |
| Bun | Stream | Large | 292.57 | 295.14 | 272.18 |

The earlier artifact prototype's longer small-document confirmation improved all four means:
Node string 30.780 to 30.325, Node encoded 46.738 to 46.195, Bun string 33.843 to 32.960,
and Bun encoded 34.323 to 34.035. Because the rebuilt screen contradicted that Bun result,
one rebuilt confirmation matched the longer window: 5,000 warmups, 20,000 measurements,
four alternating orders. It produced:

| Runtime | Mode | Retained eXact | Candidate | React |
| --- | --- | ---: | ---: | ---: |
| Node | String | 31.617 | 30.607 | 22.110 |
| Node | Encoded | 47.504 | 46.395 | 32.301 |
| Bun | String | 33.753 | 33.678 | 33.071 |
| Bun | Encoded | 34.324 | 34.623 | 38.744 |

This supports a modest Node improvement, not a general Bun improvement. Absolute numbers
from different windows must not be compared as paired evidence. Shared-host variation and
population length affect the measurements; no engine-level explanation has been established.
No statistical confidence interval or HTTP throughput claim is inferred from these means.

## Integration and validation

The final native implementation passed its Go tests and 340 SSR/compiler tests across 54
files. A concurrent-request test exercises shared static input with different target contributions
and backpressure. A compiler guard excludes structural and authored component inputs from reuse.
The rebuilt artifact contains the same five eligible sites as the prototype. After the ownership
guard and compiler identifier-scan cleanup, the isolated artifact remains byte-for-byte identical
to the measured candidate (SHA-256 A8006EFF178F970AF9F4FE9C1D3F5124BDF2B244C4BDF7085A62ECDFC972995E).
The native executable and source build stamp are synchronized.

All eXact package compilation, test typechecking, 56 production browser checks across Node/Bun
and string/stream, compiled ABI, source architecture, JSDoc, targeted lint, and platform-boundary
checks passed. Canonical comparison client, Node, and Bun builds include the implementation.
The first package-content command failed because the temporary runner failed to quote npm's
call argument; its corrected invocation passed and is recorded separately.

The change is retained for its repeated modest Node result and removal of redundant allocations
without a second renderer or sink-specific generated code. Bun improvement is not established,
and the mixed large-document results remain part of the evidence. This decision does not impose
a minimum gain threshold or claim universal performance improvement. No public API,
sink API, writer ABI, or published performance chart has changed for this experiment.

## Integrated HTTP comparison

A subsequent 24-population run compared the archived direct-list build, current static-input
reuse build, and React in two reversed orders. Each used 32 concurrent requests across two
drivers, two seconds warmup and four seconds measurement, preloaded incident data, and four
asset tags. Every response was checked against its complete-document identity. All populations
had zero errors. Mean valid requests per second:

| Runtime | Mode | Previous eXact | Current eXact | React |
| --- | --- | ---: | ---: | ---: |
| Node | String | 7,016.9 | 7,049.5 | 9,670.3 |
| Node | Stream | 6,273.1 | 6,198.4 | 3,914.7 |
| Bun | String | 8,516.6 | 8,614.6 | 9,028.8 |
| Bun | Stream | 6,598.4 | 6,568.0 | 6,676.6 |

The HTTP evidence is mixed: string throughput improved 0.5% on Node and 1.2% on Bun,
while streaming decreased 1.2% on Node and 0.5% on Bun. These short shared-machine runs do
not establish that those small differences are reproducible. Current eXact trails React by
27.1% in Node string, 4.6% in Bun string, and 1.6% in Bun stream throughput. Node streaming
is ahead by 58.3%. The full objective remains unmet.

The previous artifacts were extracted from the direct-list evidence archive, preserving the
actual Node and Bun builds. React retained its participant directory and dependency resolution.
HTTP runners, frozen baseline artifacts, and raw results are preserved in
static-server-invocations-http-2026-09-10-evidence.zip.

Raw runners, captures, prototype artifacts, source snapshots, and available validation logs are
preserved in the adjacent static-server-invocations-2026-09-10-evidence.zip, including the final
native rebuild log. Follow-up integration evidence is recorded in the adjacent
static-server-invocations-integration-2026-09-10-evidence.zip.
