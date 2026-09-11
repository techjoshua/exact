# Current HTTP profile and hydration serialization audit

The fresh profile continues to locate the main eXact/React difference in rendering and hydration, rather than socket output. Follow-up measurements show that the serializer's sampled attribution must not be treated as a directly recoverable timing budget. No runtime, compiler or application source changed in this investigation.

## HTTP capture

Node 26.8.1, production builds, full application-owned documents with four asset tags, two reversed framework orders. Each fresh worker warms for ten seconds before a ten-second profile at 3,000 total offered requests/s using two independent drivers. Every started measured request returns valid complete output. eXact completes 60,000 valid responses; React completes 59,998, with two missed arrivals and no response errors. Missed arrivals are scheduling observations, not failed responses. Worker and adapter artifact identities are checked before and after capture.

The workstation remained in active use. Sampled durations include the profiler's wall-time attribution and are not an additive decomposition of process CPU time. Instrumentation, scheduling and run-to-run variation prevent these samples from proving precise potential savings.

Sampled microseconds per valid request:

| Category | eXact | React |
| --- | ---: | ---: |
| Rendering and components, excluding eXact hydration helpers | 81.80 | 64.83 |
| eXact hydration JSON serialization | 9.65 | Included in rendering |
| eXact hydration validation/projection | 5.13 | Included in rendering |
| Other eXact hydration publication | 0.79 | Included in rendering |
| Response ownership and adapter | 2.36 | No matching separate category |
| HTTP output and socket | 43.71 | 42.61 |
| HTTP input and dispatch | 18.48 | 15.74 |
| GC | 4.82 | 1.75 |
| Benchmark telemetry | 10.81 | 9.27 |

React's document component serializes its bootstrap data; it is not credited with zero serialization work. Summing eXact's rendering and hydration categories gives 97.38 microseconds versus React's 64.83 rendering category. Socket-output samples are close. The profiler does not establish the cause of the smaller input/dispatch difference.

Measured process CPU per valid response is 245.05 microseconds for eXact versus 172.92 for React. Individual populations are 246.37/243.73 versus 191.17/154.67. These are profiled observations, not uninstrumented capacity measurements. eXact sends 4,672 bytes and React 3,660; both complete their own shells and component trees.

Prominent named eXact rendering self-attributions include serializeJson (9.65), scriptSources (5.13), validatePositionalValue (4.03), startsExactDocument (3.26), createChunkedHydratableResult (3.08), markerPair (2.55) and stylesheetSources (2.21). React Document accounts for 10.53 and includes its own asset processing and bootstrap JSON. Earlier experiments on document boundaries, escaping and projector thresholds were reviewed rather than assumed absent.

## Payload audit

The actual post-validation, pre-serialization eXact payload is inspected in a diagnostic bundle. The small fixture contains 19 arrays and 715 unescaped JSON bytes; the 96-incident fixture contains 205 arrays and 10,263 bytes. Neither has object containers, proxies, accessors, symbol properties, sparse holes, custom toJSON properties or a replacer callback. The final escaped payloads are 745 and 10,293 bytes. This rules out several suspected sources of serialization overhead for these fixtures, not for all application values.

## Replay and fresh-render measurement

Replaying the captured graph uses 20,000 warmups and 100,000 measured calls per variant, in two reversed orders within each runtime process. Mean current serialization plus escaping is 1.33/10.73 microseconds for Node small/large and 1.18/15.19 for Bun. Plain JSON.stringify is faster because it omits the required script-safe escaping; it is a diagnostic control, not an acceptable replacement. Passing undefined as the replacer does not establish a useful improvement.

Replay reuses strings and containers that have already been serialized. A separate instrumented renderer therefore times JSON.stringify and escaping on newly prepared hydration graphs. Each runtime warms 50,000 full renders, then measures 20,000 for each fixture. Three performance.now calls per serialization add instrumentation overhead. Output hashes match the control, including the exact small HTTP identity.

| Runtime | Fixture | JSON microseconds | Escaping microseconds | Sum |
| --- | --- | ---: | ---: | ---: |
| Node | 3 incidents | 1.09 | 0.74 | 1.84 |
| Node | 96 incidents | 10.45 | 2.13 | 12.58 |
| Bun | 3 incidents | 1.50 | 0.70 | 2.20 |
| Bun | 96 incidents | 15.21 | 3.14 | 18.36 |

This tight-loop diagnostic differs from HTTP profiling and does not invalidate the profile. It does invalidate interpreting the 9.65-microsecond HTTP sample attribution as a demonstrated amount that a new serializer would save. Serialization scales with payload size, but the observed small-document gap requires attention to the rest of component preparation and traversal. No JSON semantics, validation guarantees, byte limits or escaping rules were weakened.

## Evidence

The eXact control remains SHA-256 `9093d5a3f3fdc1df26aa016be083964eace4f50ddb87766312e813331dd235b3`. The profile captures React and adapter hashes separately. `completed-html-profile-2026-09-10-evidence.zip` contains raw profiles, the complete capture and analysis, the profiling worker and runners, exact source artifacts, payload audit, replay and fresh-render instrumentation with all observations. All task-owned processes closed. No new package or browser acceptance run is claimed because production implementation is unchanged.
