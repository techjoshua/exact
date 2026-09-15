# Leaf-output object-shape follow-up, September 10, 2026

Decision: keep the production renderer. Matching cached leaf output to the ordinary output map does not recover Node timing in this screen. The experiment tests one proposed explanation for the preceding mixed results; it does not establish their complete cause.

## Hypothesis and variants

The frozen cached facade has context and sink fields; ordinary program output also has target, render and prepareReferences. Shared operations may therefore see different object maps. Hypothesis: removing that mismatch could recover a few percent of timing lost by the cache prototype, without reintroducing per-leaf facade allocation. This is a shape/cost diagnostic, not a proposal to weaken lifecycle ownership.

All three variants start from the descriptor-flag prototype, so none uses a WeakSet. The control is its frozen two-field facade. The first alternative removes freezing and retains two fields. The second uses an unfrozen five-field literal in ordinary output field order, with undefined target and existing shared forwarding functions. Leaf proof excludes child rendering and sibling preparation, so those extra functions are not invoked by eligible programs. Reuse remains request-local and sink-sensitive. The diagnostic source-scan proof remains outside measured warmup and is not a production compiler contract.

## Shape and correctness evidence

A short instrumented actual render captures an ordinary output and a cached leaf output. Node 26.8.1 V8 HaveSameMap reports false for frozen two-field, false for unfrozen two-field, and true for the five-field version. This verifies the intended map alignment for the captured output, not all runtime feedback states or an optimization guarantee.

Each new variant passes 24 full-output comparisons across Node/Bun, string/stream, small/large and three concurrent distinct requests with forced ready suspensions. Suspension counts match prior captures. Unfrozen outputs no longer enforce immutability at runtime; arbitrary generated mutation and error/cancellation behavior would require compiler proof and broader tests before adoption. No package or browser acceptance is claimed.

## Small-document timings

Twelve fresh production processes use 50,000 warmups, 20,000 measured complete response consumptions through new Response(html).text(), below-normal priority and two reversed orders. Complete document hashes match. The user is using this PC. These are in-process timings on the portable entry, not HTTP rates. Raw labels current/candidate/split mean frozen two-field/unfrozen two-field/aligned five-field, respectively. Current here is the prior prototype, not production.

| Runtime | Frozen 2 fields us | Unfrozen 2 fields us | Aligned 5 fields us |
| ------- | -----------------: | -------------------: | ------------------: |
| node    |              42.80 |                45.67 |               46.28 |
| bun     |              36.79 |                35.62 |               36.51 |

| Runtime / order | Frozen elapsed / CPU us | Unfrozen elapsed / CPU us | Aligned elapsed / CPU us |
| --------------- | ----------------------: | ------------------------: | -----------------------: |
| node / forward  |           42.77 / 43.75 |             47.59 / 48.40 |            48.82 / 48.45 |
| node / reversed |           42.83 / 44.50 |             43.75 / 44.55 |            43.75 / 44.50 |
| bun / forward   |           37.76 / 52.35 |             35.49 / 43.00 |            36.96 / 46.85 |
| bun / reversed  |           35.83 / 43.00 |             35.75 / 46.85 |            36.05 / 37.50 |

Both alternatives are slower in both Node elapsed pairs; CPU is higher or equal. Bun unfrozen elapsed improves in both pairs, while its CPU directions differ. Bun aligned elapsed improves in the first pair and regresses slightly in the second; its CPU is lower in both. These are runtime tradeoffs with shared-PC variation, not a general gain. The verified same-map alternative does not substantiate map mismatch as a sufficient explanation for the earlier Node regression.

No allocation or GC profile was captured for these alternatives. Reusing the larger object does not imply identical retained bytes, collector cost or optimized allocation. The earlier allocation reduction belongs to the separately measured frozen WeakSet prototype and is not reassigned here.

The exact retained production Node artifact still has SHA-256 2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18. No compiler ABI, framework source or public documentation behavior changed. The overall objective remains unmet. Further output-cache tuning is not supported by this screen; larger work should target eliminating invocation/traversal scaffolding instead of adding another selection mechanism.

## Evidence

- `flag`: `4bcbd9b946316fc32a70891d102f9f543d07b8eba20ba58cf2dc8569ecf5fa07`.
- `unfrozen`: `0f0963fcb02906181a388af003e9bd2267fb07172ef6bf2ea0a85de9a625a9ab`.
- `aligned`: `2cb70d345cee3bdc68587c67d631df818974a168d4f8aaff50bc2c375aabb0fd`.

The archive preserves builders, maps diagnostic and instrumented entries, raw timings and worker, pressure runners/results, frozen compared bundles, fixture and this report. Owned benchmark processes exited.
