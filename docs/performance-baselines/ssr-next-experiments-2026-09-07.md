# SSR response-path experiments — September 7, 2026

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Four candidates were tested; none earned retention. Two showed small renderer/encoding gains but
lost throughput in the two-driver HTTP confirmation. Framework source and built runtime artifacts
remain unchanged. The public Performance page now replaces its old short-window RPS headline and
curve with separately labeled sustained preloaded capacity, normal-loading throughput, and scheduled
arrival results.

The raw archive (local capture: `ssr-next-experiments-2026-09-07.json`) preserves candidate module sources, runners,
ordered samples, CPU/allocation summaries, HTTP telemetry, artifact identities, and decisions.
The previous capacity archive (local capture: `preloaded-ssr-capacity-2026-09-07.json`) supplies the full preloaded
concurrency sweep and arrival-rate evidence for the unchanged current artifacts.

## Candidates and decisions

| Experiment                                                                      | Focused effect               | HTTP effect at c16 / c128   | Decision |
| ------------------------------------------------------------------------------- | ---------------------------- | --------------------------- | -------- |
| Collect produced response chunks in an array, then join once                    | About 3.0% faster on average | About 3.7% / 2.4% lower RPS | Reject   |
| Iterate own response headers without `Object.entries()`                         | About 1.5% slower on average | Not promoted                | Reject   |
| Return early when produced-body completion has no retained scope                | About 1.7% slower on average | Not promoted                | Reject   |
| Use existing prepared positional projectors for arrays shorter than 16 elements | About 1.2% faster on average | About 3.1% / 1.6% lower RPS | Reject   |

Rejected candidates remain isolated evidence under `.tmp`; none was applied to production source.
The header experiment kept own-property filtering, and the completion experiment kept the existing
settled-completion check. The projector experiment reused the current validation/projector contract;
it did not remove serialization checks or add ABI methods. These screens do not prove the candidates
are slower for every workload, but do not support retaining them for the measured request path.

## Measurement and attribution

The focused screen uses the frozen current renderer, produced-response implementation, and Node
adapter with a minimal response sink. Each result includes final `Buffer.from` UTF-8 encoding and a
checked body identity. This is not a real HTTP result. Each process warms all variants, then measures
24 rotated/reversed rounds of 2,000 requests per variant. The first three candidates ran in three
fresh processes; the projector threshold screen ran in two. No profilers run inside timed screen
rounds or alongside HTTP measurement.

Separate baseline profiling identified positional validation, JSON serialization, generated component
work, escaping, byte accounting, and final encoding among the costs. The allocation sample estimated
approximately 27.5 KB per rendered/encoded request, including diagnostic sink overhead. It is sampled
temporary allocation, not retained heap. Existing immutable hydration schemas and prepared contracts
already avoid some repeated setup; the profile did not justify a new cache of mutable request data.

HTTP confirmation used two independently owned drivers against one eXact worker, with 10 seconds
of discarded warmup and 20 seconds each at total concurrency 16 and 128. Two fresh populations
reversed baseline/join/projector block order. All candidates produced identical complete HTTP bodies.

| Variant                   | Aggregate c16 valid RPS | Aggregate c128 valid RPS |
| ------------------------- | ----------------------: | -----------------------: |
| Current baseline          |                   9,219 |                    8,344 |
| Chunk array/join          |                   8,876 |                    8,143 |
| Lower projector threshold |                   8,930 |                    8,211 |

The small startup skew between drivers is included by dividing total valid responses by the union
of their stage time spans. Results are not pooled with the earlier capacity sweep. Baseline GC
duration per 1,000 requests was approximately 0.64–0.65 ms at c16 and 0.57 ms at c128. These samples
do not support a GC cliff as the explanation for the high-concurrency throughput loss. They also do
not isolate HTTP connection handling, scheduling, allocation, or instrumentation as its sole cause.
Object pooling was therefore not introduced on speculation.

## Updated public capacity evidence

A fresh normal-loading comparison used two drivers at total c32, 15 seconds warmup and 30 seconds
measurement, with eXact/React then React/eXact in fresh populations. Both frameworks fetched and
decoded the shared service data on every request. Aggregate valid throughput was approximately
2,772 RPS for eXact and 2,747 RPS for React. The normal-loading capture is separate from preloaded
capacity, and neither substitutes for a native full-stack benchmark.

The public page now presents:

- The admitted preloaded c16–c128 sweep, with best measured aggregates around 9,130 RPS for eXact
  and 9,106 RPS for React. The headline explicitly says data is already loaded.
- The fresh normal-loading c32 results above.
- Scheduled preloaded arrivals at 8,000/10,000 RPS, including capacity misses and response-p99 ranges.

The old 500 ms window RPS headline and scaling chart are superseded. The independent-driver work
exposed a generator limit and demonstrated sensitivity to load shape; it does not make every
historical timing invalid. Browser, response-time, payload, and memory charts keep their separately
dated evidence. No unmeasured frameworks are assigned new sustained capacity values.

`publish-ssr-capacity.mjs` checks target and shared-runtime identity across the admitted captures,
complete populations, response identity, separate drivers, and error-free request accounting before
writing `apps/docs/src/data/ssr-capacity-report.json`. Its source-only summarizer has regression
coverage for concurrent-span aggregation and rejection of incomplete or inconsistent evidence.

## Validation

All experiment HTTP responses validated, with zero request errors or telemetry sampling failures.
Target entry and shared runtime hashes remained unchanged. All 71 comparison tests, targeted lint and
formatting, docs type checking/build, and desktop/mobile rendered-page checks validate the final
tooling and presentation. No runtime candidate is being shipped based solely on a microbenchmark.
