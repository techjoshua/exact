# Full-document performance investigation, September 9, 2026

This investigation follows the immutable [string/stream baseline](render-modes-2026-09-09.md). The [final full capture](post-shell-2026-09-09.md) reports the combined production implementation. Focused experiments below alternate frozen baseline and candidate builds, retain React controls, and verify complete component-rendered documents. They do not impose a minimum percentage for adoption. Rejected variants remain evidence, not production behavior.

## Combined focused HTTP comparison

Two reversed fresh process populations per runtime/API, two load drivers, concurrency 32, two-second warmup and four-second measurement. Arithmetic mean RPS across the two populations. These short windows establish direction and do not replace the sustained full capture. The final accessor-safe root-input comparison was added after this run; it preserves ordinary fixture output.

| Runtime | API    | Frozen baseline | Retained changes | React control | eXact change |
| ------- | ------ | --------------: | ---------------: | ------------: | -----------: |
| node    | string |            5744 |             7479 |         10278 |        30.2% |
| node    | stream |            4454 |             5187 |          4205 |        16.5% |
| bun     | string |            7131 |             9149 |          9836 |        28.3% |
| bun     | stream |            4437 |             5336 |          7016 |        20.3% |

All 24 blocks completed without request errors. Server-side application output and expected byte/hash identities were admitted before timing. Comparison with the original stream baseline removes comments only for the cross-version equivalence assertion, since redundant markers intentionally changed; each timed response still has its exact expected hash.

## Incremental renderer experiments

Four alternating fresh processes per variant, runtime and fixture. Percentages below are changes in small-fixture rendering time; negative is faster. The JSON includes large and extended-text results. Each row compares against its immediate experimental baseline, so percentages must not be summed. Up to experiment 10, the fixture labelled Unicode contained mojibake and question marks due to shell encoding. Those captures are larger-text comparisons, not Unicode coverage. Subsequent fixtures and independent encoding tests use explicit Unicode escapes.

| Experiment                                           | Decision                    | Node time change | Bun time change |
| ---------------------------------------------------- | --------------------------- | ---------------: | --------------: |
| 1. Reverse body-close search                         | Retain                      |          -19.44% |         -13.13% |
| 2. Aggregate byte accounting                         | Retain                      |           -8.74% |           2.10% |
| 3. Direct synchronous capture                        | Retain                      |           -1.40% |          -1.90% |
| 4. Avoid awaits for rendered strings                 | Retain                      |           -2.07% |          -2.08% |
| 6. Transfer result objects in place                  | Reject                      |           -0.56% |           1.69% |
| 7. Inline async depth ownership                      | Retain                      |           -1.27% |          -5.06% |
| 8. Compact async markers and prepared keyed programs | Retain                      |           -4.77% |          -4.31% |
| 9. Shared generic capture class                      | Reject                      |            3.14% |          -1.34% |
| 10. Prepared-child dispatch first                    | Retain, magnitude uncertain |           -0.85% |          -0.66% |
| 11. Single-pass HTML escaping                        | Retain                      |           -1.85% |          -2.47% |
| 12. Bounded portable UTF-8 search                    | Retain as fallback          |           -5.88% |          -1.11% |
| 13. Skip awaits for synchronous preparation          | Retain                      |           -2.14% |          -1.08% |
| 14. Preserve canonical document children             | Retain                      |           -0.75% |          -2.31% |
| 16. Return existing plain-render promise             | Retain                      |           -1.03% |          -2.86% |
| 17. Native UTF-8 length capability                   | Retain                      |           -3.84% |          -8.28% |
| 19. Skip empty instance cleanup                      | Retain                      |           -1.36% |          -1.23% |
| 20. Static literal meta attributes                   | Retain                      |            0.15% |          -2.01% |
| 21. Remove short-text cutoff                         | Reject                      |           -1.75% |           1.11% |
| 23. Single hydration-escape scan                     | Reject                      |           -0.27% |          -1.67% |
| 24. Shared escaping RegExp instances                 | Reject                      |           -0.36% |          -3.02% |

Workload-specific regressions remain in the JSON and experiment log. In particular, removing short-text tuning and combining hydration escape passes regressed Bun or Unicode workloads, so both were reverted. A prototype using cached property descriptors for opaque operations was also rejected: it was 2.2-2.8 times slower on Node and 1.7-1.8 times slower on Bun.

## Navigation and full-shell ownership

The shell change had replaced deferred element hydration with immediate document hydration because the scheduling API only accepted elements. The framework now supports Document in hydrateAfterNavigation, preserving capture-phase activation for the first interaction and normal document adoption. The comparison application uses that existing public scheduling API.

Thirty balanced cold-context samples compared the frozen immediate build, deferred candidate and React:

| Metric, mean ms     | Immediate eXact | Deferred eXact |  React |
| ------------------- | --------------: | -------------: | -----: |
| Navigation          |          39.037 |         29.123 | 35.663 |
| FCP                 |          44.267 |         42.133 | 46.533 |
| Semantic ready      |          43.767 |         50.270 | 50.913 |
| Optimistic feedback |           1.733 |          1.643 |  1.487 |
| Settlement          |          13.863 |         14.060 | 13.657 |

This shifts hydration scheduling: navigation completes about 9.9 ms earlier while semantic readiness moves about 6.5 ms later, near the React control. It does not remove that work. First-interaction and scheduled document-adoption tests protect activation and element identity. Full-suite startup profiles report semantic readiness separately.

## Streaming and transport experiments

The original stream full document was 4,353 bytes; compact native marker rules reduce it to 3,966 bytes, matching eXact string output. React is 3,457 bytes in both lanes. Both frameworks construct their own application shell. eXact full-document progressive output still retains the authored shell until hydration is ready; these results do not establish early-head streaming.

Smaller 2/4/8 KiB chunks did not improve whole-document HTTP output consistently. At 2 KiB, large-document throughput fell 7.29% on Node and 2.14% on Bun. Explicit message corking fell 20.05% for small Node documents and 29.46% for large ones. A first corked attempt was rejected before timing because end() with an outstanding message cork truncated the response; a standalone reproduction and explicit uncork-before-end corrected the experiment. All 44 corrected output blocks had exact bytes and zero errors. No chunk-size or cork API was added.

Native buffer encoding helped Bun about 2% and was near-neutral on Node, so optional native encoding was retained with a standard TextEncoder fallback. The byte counter similarly uses native host capabilities without importing Node into the neutral runtime. Buffered Bun responses now pass complete text directly to Response, avoiding Blob conversion: focused throughput improved about 3.2% small and 2.9% large. Produced streams keep their streaming ownership path.

Pre-encoding completed Node strings before end() instead lost about 4% small and 1.4% large throughput. Letting end() prepare headers was neutral to slightly slower. Both were rejected. Buffer.concat and pooling would add copying to the current single-document output; they need a genuinely incremental traversal to be useful.

The final shared-RegExp probe improved several renderer fixtures, but HTTP throughput was effectively neutral on Node, about 0.7% better for Bun strings, and about 0.8% worse for Bun streams. All sixteen HTTP blocks preserved exact bytes with zero errors. It was rejected rather than introducing shared regex state for an inconsistent response-path result.

## Remaining costs and architectural boundary

Matched Node HTTP profiles still show hydration JSON serialization, positional validation, request-owned compiler operation allocation, garbage collection, and socket writes. Direct state capture avoids generic bridge allocation only where compiler-owned storage proves the read contract; nested and published inputs retain accessor-safe comparisons. No serialization types, limits, cancellation, or lifecycle guarantees were removed to improve a score.

A component classified synchronous may have asynchronous descendants. Switching an entire streaming tree to synchronous rendering therefore needs a compiler proof of the reachable subtree and output-extension behavior. Trying synchronous rendering and falling back would risk executing component work twice. Genuine incremental document delivery also needs ownership-aware traversal and hydration placement, not merely chunking a completed string. These are larger compiler/runtime designs requiring new evidence and contract coverage, rather than remaining safe local substitutions identified by these profiles.

## Validation findings

The broader hydration suite exposed a fixture that declared nonblocking work while requiring SSR to wait for settlement. Additional promise turns had made it pass accidentally. The fixture now declares blocking readiness and waits on a test-controlled external operation. Its test proves publication waits for release, hydration does not repeat settled work, and a later dependency change runs the task once. No production waiting policy changed. Failed preflight and diagnostic attempts remain in the full evidence bundle.

Maintainability review separated request-local enhancement route ownership from enhancement rendering, and attribute lowering from render-program traversal. Compiler tests and source architecture checks cover the resulting modules.

## Evidence

The [structured investigation](post-shell-optimization-2026-09-09.json) records incremental results, hypotheses and evidence hashes. The [experiment bundle](post-shell-optimization-2026-09-09-evidence.zip) retains runners, frozen experimental artifacts, raw measurements, rejected variants, profiles and logs. The work log records expected effects before each experiment, including predictions disproved by measurements. No released ABI fixture was regenerated.

Evidence bundle SHA-256: `b616ee9b5e26389f2735b191829fde144f6324c8d95ed046e771f6f67d6c3df1`.
