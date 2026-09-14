# Inline projector with longer warmup, September 10, 2026

Status: active-path reconsideration completed; candidate remains unadopted. Production source and canonical applications were unchanged throughout.

The preceding warmup audit weakened the attribution of a small-document slowdown to inactive projector code. This follow-up evaluates the actual changed path: 96-incident documents, where the activation probe counted 96 projector calls. The candidate is the frozen artifact built from the compiler implementation, not a new textual variant. Its null/string/boolean checks retain node/depth budgets; all other values use the existing validator. Earlier focused equivalence and compiler/SSR tests remain recorded in projector-inline-primitives-2026-09-10.md. No new implementation is accepted based on those tests alone.

## Method and results

Thirty-six fresh production processes cover Node/Bun string/encoded/stream, with two reversed orders of retained eXact, candidate, and React. Each warms 50,000 renders and measures 20,000. This uses the longer warmup motivated by the earlier audit; it is not a claim that 50,000 proves convergence for every workload. The worker checks complete document boundaries, four asset tags and final eXact output hashes. All candidate hashes match the retained artifact. Encoded means constructing a Response and consuming its text, and streaming consumes the full stream. These are renderer/consumer timings, not HTTP rates. No build, test, or profiler runs concurrently with measurement. All populations remain in the raw capture.

Mean microseconds per render, lower is better:

| Runtime | Mode    | Retained eXact | Inline candidate |  React | Candidate change |
| ------- | ------- | -------------: | ---------------: | -----: | ---------------: |
| node    | string  |         165.68 |           165.78 | 130.08 |            +0.1% |
| node    | encoded |         194.00 |           199.47 | 183.90 |            +2.8% |
| node    | stream  |         184.81 |           182.45 | 328.12 |            -1.3% |
| bun     | string  |         219.16 |           218.51 | 206.05 |            -0.3% |
| bun     | encoded |         229.33 |           217.96 | 222.21 |            -5.0% |
| bun     | stream  |         261.83 |           269.76 | 308.59 |            +3.0% |

The Node string gain from the shorter-warmup experiments does not repeat. Node encoded responses are slower in both orders, while Bun encoded responses are faster in both. String rendering is effectively flat. The candidate adds generated branches and trades performance between runtimes rather than establishing a broad improvement, so it remains out of production. This decision follows the active-path results, not the earlier uncertain small-document regression. The measurements do not establish a causal engine-level explanation for the tradeoff.

## Input and follow-up audit

The focused input was compared with the controlled service fixture and its session/incidents API responses. They match; the difference between renderer and HTTP results is not explained by stale incident data. The comparison and fixture hash are archived.

A separate source review found two per-component callbacks in renderComponentReference that capture request context/options while accepting child owner explicitly. Sharing those callbacks within the same context and options identity is a concrete next hypothesis. It must preserve option isolation, recursive owner arguments, pending children and capture scopes. No such optimization was implemented or measured in this experiment, and no benefit is claimed.

The retained compiler source, overlay, tests, and Node/Bun application hashes were verified; no task-owned process remained. No ABI fixtures were regenerated. The overall objective remains unmet.

Evidence: `projector-long-warmup-2026-09-10-evidence.zip`, SHA-256 `5b292237bf6a8c3f1875a4287e59082ee1e53632d2efd85d0663404fde656891`.
