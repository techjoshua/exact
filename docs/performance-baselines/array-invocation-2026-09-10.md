# Array-backed server invocation experiment, September 10, 2026

Decision: retain the current implementation. This isolated prototype tests whether a prepared program can use its captured-values array as the invocation, eliminating a separate wrapper. The prior HTTP comparison still leaves Node and Bun string throughput behind React. This experiment does not resolve those gaps.

## Hypothesis and ownership

Expected opportunity: roughly 1-4% less total allocation, with uncertain timing because metadata properties may make array access or storage more expensive. Current prepared programs contain a realm-stable brand, a hoisted descriptor and an eagerly captured values array. The prototype places those metadata properties on the array itself and makes eagerValues refer to that array. Generic child normalization recognizes the brand before flattening arrays. No second renderer, sink branch, deferred authored read or cached request output is introduced.

This is not an API-compatible replacement for createPreparedServerRenderProgram: the existing helper accepts readonly arrays and returns a separate wrapper. A production redesign would require a compiler-owned mutable-array transfer contract, a complete audit of array normalization and repeated/hoisted invocation ownership, and coordinated compiler/runtime/tests/documentation changes. Passing these fixtures is insufficient authorization to silently mutate existing helper inputs.

## Correctness screening

Twenty-four complete-output comparisons pass across Node/Bun, small/large fixtures and string/stream modes. Each case renders three concurrent distinct requests while injecting a resolved Promise at every third ready check. Each runtime observes 183/105 suspensions for the small string/stream group and 1,113/663 for large. Canonical production artifacts are unchanged. No package or browser acceptance run is claimed for this rejected prototype.

An initial scratch build failed its raw-hash assertion because text newline normalization preceded hashing; this was corrected to hash input bytes. The next scratch output failed document equality because Python used the Windows default output encoding. Writing explicit UTF-8 corrected that tooling error before the successful comparisons and all measurements. Neither failure changed production.

## Allocation and timing

Fresh Node sampling processes warm 50,000 renders, then measure 10,000 with 16 KiB allocation sampling including objects collected by minor and major GC. Two reversed orders run below-normal priority. The user is actively using the PC.

| Fixture | Current estimated bytes/render | Array carrier | Change |
| --- | ---: | ---: | ---: |
| small | 68,125 | 67,520 | -0.89% |
| large | 497,810 | 500,245 | +0.49% |

Sixteen separate production timing processes use 50,000 warmups and 20,000 measured renders, consuming each complete string through new Response(html).text(). These are response-consumption timings, not HTTP rates. Both runtimes use the same portable Node entry; Bun HTTP uses a different entry in the independent HTTP report. Lower is better.

| Runtime / fixture | Current us/render | Carrier us/render | Current CPU us/render | Carrier CPU us/render |
| --- | ---: | ---: | ---: | ---: |
| node / small | 41.16 | 41.72 | 41.02 | 42.20 |
| node / large | 204.53 | 207.98 | 206.23 | 208.98 |
| bun / small | 35.54 | 36.28 | 39.08 | 42.98 |
| bun / large | 279.26 | 274.84 | 374.20 | 369.48 |

Raw timing uses the label split for the array carrier and current for the retained build. Allocation uses candidate and integrated, respectively. Both large allocation pairs increase; both small pairs decrease. Node elapsed timing has mixed pair directions for both fixtures. Small Bun elapsed timing is mixed, with higher candidate CPU in both pairs. Large Bun elapsed and CPU improve in both pairs. These tradeoffs do not establish a general improvement. CPU totals include all process threads and remain sensitive to machine conditions.

## Why removing the wrapper did not remove equivalent heap cost

After measurements completed, a short Node diagnostic invokes each actual factory with a two-value array and prints V8 object layouts. The control has a 56-byte wrapper with metadata in in-object fields, plus the ordinary 32-byte array and its element storage. The carrier remains a 32-byte packed array with fast properties, but its three metadata fields require a separate PropertyArray[3]. It does not become a dictionary array in this diagnostic.

This directly establishes replacement metadata storage, not a complete allocation or timing explanation. Inlining, optimized allocation elimination, property transitions and the extra normalization guards may affect whole-render results; the layout print alone does not quantify them. A follow-up design should eliminate storage or traversal work, rather than assume merging two visible JavaScript objects eliminates a backing allocation. No further same-shape tuning is justified by these results alone.

## Evidence

- `.tmp/ssr-large-profile/direct-execution-integrated/server-entry.js`: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
- `.tmp/ssr-large-profile/array-invocation/server-entry.js`: `ad21ca825cda39d205ad89b617ddc5f5fc6e548d2be14aeac2da4e80dd178b98`.

The evidence archive preserves the builder, two frozen bundles, pressure runner and results, allocation profiles, timing populations, workers, V8 layout logs, fixture, relevant source snapshots and this report. The overall optimization goal remains unmet.
