# Current Node string HTTP profile and response experiments, September 10, 2026

The retained scalar-prop build was profiled against React in production with the full application-owned small document and four asset tags. Two reversed-order populations use 3,000 offered requests/s for ten seconds after warmup. All 119,971 completed requests matched their complete document identity and had zero response errors. There were 29 scheduling misses across the four populations. The profiler uses a 250-microsecond sampling interval; instrumented CPU and sampled stack time are not ordinary throughput measurements.

| Sampled stack category              | eXact us/request |            React us/request |
| ----------------------------------- | ---------------: | --------------------------: |
| HTTP input and dispatch             |            13.24 |                       13.75 |
| HTTP output and socket              |            39.56 |                       38.20 |
| Other rendering and components      |            65.12 |                       51.32 |
| Hydration JSON serialization        |             9.81 | included elsewhere / absent |
| Hydration validation and projection |             4.46 | included elsewhere / absent |
| Other hydration publication         |             0.89 | included elsewhere / absent |
| Response ownership and adapter      |             2.19 | included elsewhere / absent |
| Garbage collection                  |             4.47 |                        1.47 |
| Benchmark telemetry                 |             7.93 |                        8.57 |

React document construction includes its JSON serialization in the rendering category. Therefore the separate hydration rows are not a symmetric attribution of identical operations. Categories use stack ancestry and precedence, not exclusive measured phases. Sampled stack time includes scheduling effects and must not be treated as removable CPU time. The eXact document is 4,672 bytes; React is 3,660. Neither payload is padded.

The adapter is a relatively small directly sampled site. eXact result construction is about 2.3 sampled us/request and scriptSources about 4.1. Existing single-result, shared-getter, native-document-probe, and hydration-escape reports already cover alternatives to these hot sites. They were not repeated here.

## Plain completed-response diagnostic

Hypothesis: bypassing buffered-response construction for an already completed immutable string may improve HTTP throughput by 0-3%. The diagnostic retains writeNodeResponse, the same status and headers, the same rendered bytes, and byte telemetry. It uses the existing plain response body path. It is not integrated and does not preserve the buffered factory's independently claimable stream/text facade. The candidate worker additionally includes inactive profiler control routes; this is an upper-bound direction test rather than a perfectly isolated factory microbenchmark.

| Variant   | Valid requests/s |
| --------- | ---------------: |
| baseline  |           7016.3 |
| candidate |           7201.3 |
| react     |           9737.7 |

All six populations completed with zero errors. The small gain warrants a narrow ownership-object allocation experiment, not removal of lifecycle guarantees.

## Merged buffered-response owner: rejected

Hypothesis: one object can hold the response facade and buffered-body ownership, avoiding the separate body object. The artifact prototype retains own enumerable lazy body/stream accessors, repeated text reads, single-consumption rejection, and cancellation. Its body storage uses private fields so those internal fields do not appear among response keys. It changes the response prototype and exposes ownership methods through that prototype. Those observable changes would require review before adoption. No production source was changed.

Sixteen fresh production processes use four alternating orders per runtime, 50,000 warmups and 500,000 constructions/consumptions per process. Each independently checks response keys, text caching, exclusive streaming/text consumption, and cancellation. Values are microseconds per construction plus text consumption.

| Runtime | Current | Candidate |
| ------- | ------: | --------: |
| node    |   0.284 |     0.269 |
| bun     |   0.144 |     0.140 |

The subsequent Node string HTTP comparison uses the same worker scaffolding for both eXact variants. Both include inactive profiler control routes, so the factory import is the candidate difference. Two reversed orders use concurrency 32, two seconds warmup, four seconds measured, and complete response identity validation.

| Variant   | Valid requests/s |
| --------- | ---------------: |
| baseline  |           7205.0 |
| candidate |           7187.7 |
| react     |           9621.6 |

All six populations completed with zero errors. The microbenchmark saving did not translate into an HTTP gain. The candidate is rejected because the additional public shape change has no demonstrated application benefit. This is not a minimum percentage rule. No browser or package validation is claimed for the rejected artifact; the retained framework build remains the previously validated scalar-prop implementation.

Profiles, full raw load results, analysis scripts, isolated candidates, source snapshots, and build identities are preserved in current-node-response-profile-2026-09-10-evidence.zip. The overall goal remains unmet.

Archive SHA-256: `775d2b536cec0dd63529310fb4770fd3fecb0f45e774205ee3cb54fd0c782190`.
