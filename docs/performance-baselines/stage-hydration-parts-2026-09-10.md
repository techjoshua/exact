# Hydration publication substage diagnostics, September 10, 2026

Whole-publication bypass again improves HTTP string throughput in all six groups on both runtimes. Partial bypasses do not provide a clean additive attribution on Node. This supports continuing to target hydration publication, but does not establish that either projection/validation or serialization alone accounts for the largest avoidable cost. No prototype is integrated.

## Diagnostic boundaries

All requests render the full component tree and use the same response adapter. Four variants use fixed, preloaded benchmark data and produce identical complete eXact documents:

- Normal: current retained publication.
- Front bypass: reuse the first validated compacted graph, skipping subsequent metadata construction, positional projection and validation. JSON serialization, escaping, byte accounting and script construction still execute. The prototype explicitly rejects reactive-collection encoding during initial construction rather than assuming cached collection mappings are safe.
- Tail bypass: build and validate the graph normally, then return the first completed script instead of repeating JSON serialization, escaping, byte accounting and script construction.
- Whole bypass: return the first completed script at the outer hydration-publication entry.

All bypasses are unsafe for changing data and are diagnostic only. Front and tail retain execution inside renderHydrationScriptValue, unlike whole bypass. Their costs need not add: allocation, cached graph/string reuse, JIT behavior and GC effects differ. These runs do not quantify those interactions or isolate which one explains the discrepancy. No reactive collection, output extension, nonce variation or streaming correctness claim is made for the bypasses. Production remains unchanged.

## Method

Node 26.8.1 uses Node HTTP; Bun 1.4.2 uses its native Fetch entry. Four servers remain alive for one runtime, with ten seconds warmup each. Only the selected server receives load during each 1.5-second measured block. Six rotated orders compare the variants; two drivers supply sixteen concurrent requests each. Owned workers, service and drivers use below-normal priority 10. The user is using this PC. Short interleaving reduces temporal separation but cannot remove workstation variation or warm-state effects.

Full application-owned documents include four asset tags and 4,672 bytes in every variant. Every measured body is validated by complete hash, and all four initial documents must match exactly within each runtime. Rates use valid completions divided by the union of the two driver measurement windows. No public baseline or new React comparison is claimed.

## Results

| Runtime | Normal req/s | Front bypass | Tail bypass | Whole bypass |
| --- | ---: | ---: | ---: | ---: |
| node | 6,248 | 6,426 | 6,702 | 8,841 |
| bun | 8,731 | 9,284 | 9,078 | 9,739 |

| Runtime / group | Normal | Front bypass | Tail bypass | Whole bypass |
| --- | ---: | ---: | ---: | ---: |
| node / 1 | 5,035 | 5,411 | 5,578 | 8,678 |
| node / 2 | 6,233 | 6,792 | 7,034 | 8,989 |
| node / 3 | 6,724 | 7,379 | 5,844 | 8,795 |
| node / 4 | 7,038 | 5,786 | 6,605 | 8,819 |
| node / 5 | 7,274 | 6,599 | 7,805 | 9,279 |
| node / 6 | 5,187 | 6,586 | 7,347 | 8,487 |
| bun / 1 | 9,105 | 9,551 | 9,418 | 9,429 |
| bun / 2 | 8,702 | 9,021 | 9,108 | 10,089 |
| bun / 3 | 8,511 | 9,385 | 8,528 | 9,296 |
| bun / 4 | 8,827 | 8,699 | 8,996 | 9,830 |
| bun / 5 | 8,441 | 9,703 | 9,176 | 9,975 |
| bun / 6 | 8,797 | 9,346 | 9,244 | 9,816 |

All 587,062 measured responses pass complete-body validation with zero errors. Both partial Node bypasses improve in four of six groups and regress in two. Bun front improves in five groups; tail and whole improve in all six. Some partial differences are small. Whole bypass improves in every Node group as well. No population is discarded.

## Implication

Do not turn the differences between these means into an additive CPU budget. In particular, the large Node whole-bypass gain is not reproduced by adding the two partial means. That leaves stage interactions, implementation perturbation and temporal noise unresolved. The stage-level result remains materially larger than the earlier representation experiments, but these partial controls are not sufficient to choose a production rewrite.

The next investigation should directly time or profile the phases within ordinary publication on the current renderer, keeping metadata construction, validation/projection, JSON/escaping and final byte/script work distinct. It should also account for work that materializes or encodes the returned script later in response construction. Those measurements must report instrumentation overhead and workstation variation. No such phase capture is claimed here.

## Evidence and status

- `framework-comparison/participants/exact/dist-server/server-entry.js`: `2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
- `.tmp/ssr-large-profile/stage-hydration-front-node/server-entry.js`: `e396d8b9d1ad7789994b2a88ec1583836d85ea7df05f2c883c4d6b93549b07fb`.
- `.tmp/ssr-large-profile/stage-hydration-tail-node/server-entry.js`: `fb447de9d1a5a581792c2b75f79638d8ac03f72c649e16c2f1f652e59d22bdbb`.
- `.tmp/ssr-large-profile/stage-hydration-node/server-entry.js`: `948e517c333c97597024af381b2d66ceff2a078b5adcf1318a4bec1a063f0883`.
- `framework-comparison/participants/exact/dist-bun-server/bun-server-entry.js`: `9adc04f4d5d6e78ad95730319a475918c3b4b045da9a93f812c81aa827d60d2e`.
- `.tmp/ssr-large-profile/stage-hydration-front-bun/server-entry.js`: `6aceb3295ddb34019bc62a6e946260609017e7cddb4e4b54318679049f5d666d`.
- `.tmp/ssr-large-profile/stage-hydration-tail-bun/server-entry.js`: `421a565018531923b8b9ce9f0fc9328c4747e0c2ab9d9f3fef377ad0af19b139`.
- `.tmp/ssr-large-profile/stage-hydration-bun/server-entry.js`: `2f9cc79e86c23a61e56e30663c62bed246c2ef0976e72f0c7f768702e98f8b96`.

The archive preserves all measured entries, raw results, builders, harness and relevant source. All owned processes exited. The retained production renderer, hydration rules and lifecycle contracts are unchanged. The full performance objective remains unmet.
