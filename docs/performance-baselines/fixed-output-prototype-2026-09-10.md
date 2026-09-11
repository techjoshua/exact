# Constructor-initialized combined outputs, 2026-09-10

## Hypothesis and design

The previous combined target/output reduced allocation volume but ran slower.
Test whether adding fields after target construction caused that regression.
This variant initializes sink during construction and places render/prepare
forwarding on prototypes. A subclass handles operation targets; a dedicated
execution class handles component targets. Baseline mode keeps the original
constructors and execution objects. Both modes are present in one artifact.

Programs that own preparation retain separate outputs. The existing generated
writer capability classification is diagnostic AST metadata, not a public ABI.
Eligible programs use the target as output, retaining the original host and
completion flow. Guards reject sink/context changes and unexpected preparation.
Separate output constructions remain reduced from 24 to six per fixture render.

## Validation and measurement

Four ordinary/escaped full-document checks pass. Twelve forced suspension/failure
comparisons pass on Node and twelve on Bun using the portable artifact, covering
small/large strings, selected drain rejections and complete streaming output.
This is not native Bun HTTP validation or complete adoption coverage.

Two fresh Node string workers each run baseline/candidate/baseline after ten
seconds of HTTP warmup, with five-second blocks and two fresh drivers each
holding 16 requests in flight. The baseline is the mean of adjacent blocks.
Independent isolated loops before/after each block warm and measure 10,000 renders.

| Worker | Baseline RPS | Candidate RPS | Change | Baseline HTTP us | Candidate HTTP us |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 8,542 | 8,143 | -4.67% | 57.81 | 61.86 |
| 2 | 8,660 | 8,406 | -2.94% | 57.55 | 60.54 |

All 255,020 measured responses match the complete 4,672-byte document;
zero errors. Counters, artifact hashes and adapter hashes are checked. Owned
worker/load processes exit. Raw isolated durations are preserved in summary.json.

## Allocation follow-up

Four fresh Node processes run baseline/candidate/candidate/baseline, 50,000 warm
renders then 10,000 sampled renders, with a 16 KiB interval and collected minor/
major-GC objects included. Sampling estimates allocated bytes, not retained heap
or GC pause time. Allocation capture runs after HTTP, never concurrently.

| Sample | Mode | Sampled bytes/render |
| --- | --- | ---: |
| 1 | none | 66,765 |
| 2 | reuse | 65,134 |
| 3 | reuse | 65,711 |
| 4 | none | 67,546 |

## Decision

Do not adopt this variant. Constructor initialization did not recover throughput.
The test changes target types, object layouts and forwarding methods together;
it does not prove which of those causes the slowdown. The original shared output
shape may aid writer helpers, but that remains an inference requiring profiling
or a controlled shape experiment. Fewer objects alone are not a sufficient reason
to redesign this boundary. No production source changes were made.

The shared SSR performance goal remains open. Do not repeat the same combined-
output experiments without a new explanation supported by evidence.

The adjacent archive contains builders, checks, raw HTTP/heap samples, fixture,
artifacts and a verified SHA-256 inventory. Workspace dependencies are not
packaged as a standalone distribution.
