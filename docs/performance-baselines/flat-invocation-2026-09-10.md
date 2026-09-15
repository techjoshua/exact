# Flat server-program invocation experiment, September 10, 2026

Status: isolated prototype retained for investigation, not production integration. Named captured fields remove a separate values array. Large Bun response consumption improves in both pairs, but Node results do not establish a gain. A post-measurement shape audit finds greater invocation map diversity, motivating a bounded follow-up rather than attributing the entire result to an unmeasured cause.

## Transformation and hypothesis

The compiler currently captures eagerly evaluated values in an array retained by a branded invocation wrapper. The prototype uses one object literal containing the same brand, descriptor and named v0/v1/... fields. Generated preparation calls pass the captured field directly into the existing validation/unwrap helper; scalar rules, invalid-value sentinels, task issuance and the shared writer remain intact. Expected opportunity before allocation measurement was roughly 2-4% less large-page allocation, with uncertain timing. The observed reduction is smaller.

An asserted TypeScript AST transformation rewrites 25 array-literal construction sites, 25 direct slot reads, 38 preparation calls and five helper signatures in an isolated built artifact. Every construction has exactly two arguments and a literal array with no spread or holes. Descriptor evaluation still precedes value expressions, and value expressions retain source order and eager evaluation. No registry, cache, new state support or separate rendering engine is added. Both control and candidate are printed with the same TypeScript printer to keep formatting effects paired.

This is a compiler/runtime ABI experiment. It does not support or audit enhanced invocations, arbitrary readonly array helper callers, all repeated-invocation scenarios or the generic client slot reader. Those paths were not silently migrated. Production adoption would require coordinated native compiler emission, core and SSR helper contracts, applicable tests, documentation and explicit initial-release ABI classification. The old helper remains unused in this isolated bundle; that is scaffolding, not a proposed compatibility layer.

## Correctness screening

Twenty-four full-document comparisons against the retained production build pass across Node/Bun, string/stream, small/large and three concurrent distinct requests. Forced ready suspension counts match the control: each runtime observes 183/105 small string/stream suspensions and 1,113/663 large. Timing/allocation populations also assert complete output hashes. These checks do not replace ownership, cancellation, enhancement, package or browser acceptance. No such acceptance run is claimed for the prototype.

## Allocation

Eight fresh Node populations use 50,000 warmups, 10,000 measured renders, 16 KiB sampling including minor/major collected objects, below-normal priority and reversed orders. The user is using the PC.

| Fixture | Printed control bytes/render | Flat fields bytes/render | Change |
| ------- | ---------------------------: | -----------------------: | -----: |
| small   |                       67,223 |                   66,721 | -0.75% |
| large   |                      497,719 |                  491,543 | -1.24% |

The small pairs are mixed; both large pairs improve. These are sampled whole-render estimates, not a precise count of removed arrays or their bytes.

## Response-consumption timing

Sixteen fresh production processes cover Node/Bun and three/96 incidents, with 50,000 warmups, 20,000 measured complete string consumptions through new Response(html).text(), reversed orders and below-normal priority. Both runtimes use the portable entry. These are not HTTP rates, and no new React comparison is claimed.

| Runtime / fixture | Control elapsed us | Flat elapsed us | Control CPU us | Flat CPU us |
| ----------------- | -----------------: | --------------: | -------------: | ----------: |
| node / small      |              47.88 |           50.14 |          48.85 |       51.58 |
| bun / small       |              36.45 |           35.46 |          44.12 |       43.75 |
| node / large      |             207.12 |          214.60 |         210.12 |      217.57 |
| bun / large       |             281.41 |          270.65 |         359.35 |      344.52 |

| Runtime / fixture / order | Control elapsed us | Flat elapsed us |
| ------------------------- | -----------------: | --------------: |
| node / small / forward    |              47.05 |           47.22 |
| node / small / reverse    |              48.72 |           53.07 |
| bun / small / forward     |              35.12 |           35.58 |
| bun / small / reverse     |              37.79 |           35.33 |
| node / large / forward    |             217.93 |          214.23 |
| node / large / reverse    |             196.31 |          214.97 |
| bun / large / forward     |             279.18 |          269.04 |
| bun / large / reverse     |             283.63 |          272.25 |

Small Node is slower in both elapsed pairs. Large Node and small Bun elapsed directions are mixed. Large Bun elapsed and process CPU improve in both pairs. Changing control performance is visible and no population is discarded. Process CPU includes all threads and does not remove shared-machine frequency or thermal effects.

## Shape audit and next hypothesis

After all timing completed, separate instrumented renders collect actual invocations by program identity. A V8 HaveSameMap grouping observes 17 programs in both variants: the control has two maps, while flat fields have seven. Different program arities now produce different layouts. This is direct evidence of map diversity, not proof of megamorphic dispatch, deoptimization or the cause of the Node timing. No optimization trace was captured in this experiment.

The shared dispatcher still reads invocation.program, so a next bounded experiment can group field layouts into a few arity classes and measure the tradeoff between extra unused fields and less map diversity. That experiment has not run. Its allocation cost must be measured rather than assumed free. Retain the flat prototype for that investigation while keeping the validated production renderer.

## Identities and evidence

- Printed control: `bc0135fbb733559a1be1fdd7a45c2a9a6e27a34914b5512868ba1b8ff37436e0`.
- Printed candidate: `e24e1ef9fe1ce08ed4e68f9c44a9346b523c876178c11ac87de74c259104d232`.
- Retained production: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.

The evidence archive preserves the AST builder, compared bundles, allocation profiles and worker, timing drivers/results, pressure checks, map diagnostic and fixture. All task-owned processes exited. Production code and compiler ABI remain unchanged; the overall React throughput objective remains unmet.
