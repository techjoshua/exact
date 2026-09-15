# Bounded chunks through progressive shell publication, September 10, 2026

Status: isolated prototype rejected. Production continues using the retained collecting string sink.

Hypothesis: preserving 2K or 8K UTF-16-character rope chunks through progressive shell publication could avoid flattening one complete shell and improve large Bun stream rendering by 3-8%. The prototype selects its sink only for progressive document rendering, retains the shared tree visitor, carries chunks on an internal symbol of the shell event, and preserves the public lazy html view. The progressive HTML consumer takes those chunks directly, reserves closing body/html tags, and emits hydration afterward. String rendering continues using the existing += accumulator. This does not publish before tree traversal or pending shell tasks complete.

Chunk sizes are soft character thresholds, not byte capacities. A whole write may exceed the threshold. A trailing high surrogate is retained for the next write so separate chunk encoding preserves surrogate pairs. Output limits use the same lower/upper bounds and exact fallback. Additional emitted chunks also consume the current HTML stream event budget; production integration would need explicit limit-contract review.

Thirty sink checks cover limits, closure, Unicode and cross-write surrogate pairs. Eighteen complete application output checks cover small, large and extended Unicode on Node/Bun. Full byte output matches the retained build. These are focused artifact checks, not browser or full lifecycle validation.

Thirty-two fresh production processes compare the retained build, 2K, 8K and React in two reversed orders, with 5,000 warmups and 10,000 measured fully consumed streams. All eXact document hashes match. Values are mean microseconds per render, lower is better.

| Runtime | Document | Retained |     2K |     8K |  React |
| ------- | -------- | -------: | -----: | -----: | -----: |
| node    | assets   |    54.03 |  55.20 |  55.44 |  66.49 |
| node    | large    |   190.33 | 196.85 | 193.60 | 330.97 |
| bun     | assets   |    56.17 |  53.56 |  54.42 |  51.87 |
| bun     | large    |   286.10 | 289.35 | 289.35 | 269.37 |

Large streaming did not improve. Additional encoding, writes, and promise waits can offset avoided flattening; the measurements do not isolate those individual costs. Small Bun results were variable. There is no demonstrated benefit supporting integration of this chunk-transfer variant. A separate ready-demand emitter experiment tests an observed unconditional promise hop without retaining the segmented sink.

Evidence archive: segmented-stream-2026-09-10-evidence.zip. SHA-256: `a5365a03b7b7e432fe89b543687c6e4f410325bb71e62f49654aca48370adcfa`. All owned experiment processes have exited.
