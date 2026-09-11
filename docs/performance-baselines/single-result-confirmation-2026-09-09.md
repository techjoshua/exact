# Single-chunk result confirmation and ownership audit

Date: 2026-09-09. Decision: do not adopt this candidate globally.

The [initial experiment](single-result-2026-09-09.md) warranted confirmation because small Node
strings and small streams improved in both pairs. This adds 32 fresh processes with identical
settings and reversed pair order: Node/Bun, string/consumed stream, three/96 incidents, 5,000 warmups
and 12,000 measured renders per population, NODE_ENV=production, complete authored documents,
empty client tags, same portable artifact, Response.text() stream consumption. All paired document
hashes match. Together the two batches contain four pairs per cell.

## Ownership findings

The production caller is tree-output.ts. It appends/prepends all output before passing
SsrOutputBuffer.finish() to createChunkedStringResult. The buffer is local to that completion
callback and is not subsequently written. Output extensions receive a materialized string and
their completed result becomes a fresh single-element array. Chunk consumers in output-result,
output-stream, and entrypoints read the readonly sequence; hydration insertion creates a separate
array. The audit found no supported post-construction mutation on this path.

Immediate capture is therefore consistent with current chunk ownership. The separate public
property-descriptor change remains: a data property permits assignment, whereas the existing
getter does not. This is not adopted implicitly. No compiler or artifact ABI change is necessary
to optimize result construction, but any public result behavior change needs coordinated review.

## Combined observations

Positive means longer rendering time. Medians are descriptive within-pair changes, not confidence
bounds. No observations were discarded.

| Runtime | Mode | Fixture | Median time change | Faster pairs |
| --- | --- | --- | ---: | ---: |
| node | string | small | -0.29% | 2/4 |
| node | string | large | -0.09% | 2/4 |
| node | stream | small | -5.79% | 4/4 |
| node | stream | large | -3.46% | 3/4 |
| bun | string | small | +1.52% | 1/4 |
| bun | string | large | +1.01% | 1/4 |
| bun | stream | small | -2.19% | 3/4 |
| bun | stream | large | -2.15% | 3/4 |

Small Node streaming improved in all four pairs. However, the initial Node string improvement
did not repeat in the confirmation batch, and large Bun strings were slower in three of four pairs.
This is a runtime/mode tradeoff, not a universal gain. With string rendering still an explicit
unresolved goal, this version is not adopted globally. The evidence remains useful for a distinct
result-layout experiment; it does not justify platform detection or a second rendering engine.

Production remains unchanged and prior improvements remain retained. No package/browser tests
were run for the bundle-only candidate. Full output hashes do not prove failure/lifecycle behavior.
The overall React parity goal is unmet. The archive preserves both batches and their reproduction
inputs, including frozen artifacts and SHA-256 hashes.
