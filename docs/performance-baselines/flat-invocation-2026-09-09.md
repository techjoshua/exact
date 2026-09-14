# Prepared invocation allocation experiment, September 9, 2026

Neither prototype establishes an improvement across Node and Bun. Production code and the initial
ABI remain unchanged. This closes a specific hypothesis left open by the direct leaf experiment:
removing the eager-value array through fixed-field invocation records is not supported by these results.
It does not rule out deeper compiler/runtime fusion.

## Experiment

The current compiler constructs a branded invocation object with a separate eager-value array.
The flat-record prototype replaces all 24 compiled invocation call sites in the frozen current
artifact with object literals containing the same brand, program, and fixed v0, v1, ... fields.
The expressions retain source evaluation order; rendering still occurs after component issuance.
All 38 preparation calls receive the specific field value, retaining existing unwrapping and rejection
rules. The control changes those preparation calls but retains the original invocation and array.
Neither variant caches request data, removes hydration validation, or introduces another renderer.

The hypothesis is that eliminating one temporary array per invocation reduces allocation and slot
lookup work. The prototype supports the artifact's two-argument, array-literal invocation sites;
its transformer rejects enhancements and spread slots rather than guessing their semantics.
Production adoption would require a designed compiler/runtime contract and broader semantic tests.

Production mode, full application-owned documents, 96 incidents, empty asset tags, string output.
Node 26.8.1 and Bun 1.4.2 use the same portable artifact. Three rotated orders, 5,000 warmups and
15,000 measured renders per fresh process: 18 populations. SHA-256 response hashes match within
every group. React was not measured in this focused allocation experiment.

| Runtime | Current, microseconds | Direct-value preparation | Flat invocation record |
| ------- | --------------------: | -----------------------: | ---------------------: |
| node    |                265.23 |                   273.35 |                 269.82 |
| bun     |                358.99 |                   355.71 |                 361.19 |

The flat-record candidate improves the first pair on each runtime but regresses the other two.
The preparation-only control is also mixed. Changes in object layouts, property access, and JIT
behavior are possible explanations, but this experiment does not isolate them. It would be incorrect
to claim the observed timings prove a particular engine mechanism.

No production change was accepted. Browser, streaming, and HTTP benchmarks were not run for these
prototypes because the initial string results do not justify a contract change. The overall goal of
beating React remains unmet. Future work should not repeat this representation change without new
evidence or a materially different hypothesis.

[Raw results](flat-invocation-2026-09-09.json) and
[evidence archive](flat-invocation-2026-09-09-evidence.zip) preserve the frozen baseline, variants,
transformer, runner, and fixture. Reproduction requires the repository's locked dependencies.
