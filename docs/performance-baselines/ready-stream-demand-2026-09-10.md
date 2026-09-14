# Ready-demand progressive emitter experiment, September 10, 2026

Status: rejected isolated artifact experiment. Production source unchanged.

The progressive emitter always awaits waitForDemand, even when its demand counter is positive. Hypothesis: avoiding that promise hop and the caller's unnecessary await might improve consumed streams by 0-3%, potentially more on Bun. The candidate returns synchronously only when open, not aborted, and demand is available; otherwise it retains waitForDemand and enqueues after settlement. Encoding, limits, shared traversal, string accumulation, and hydration serialization remain unchanged.

Twenty-four fresh production processes compare the retained scalar-prop build, candidate, and React across Node/Bun and small/large documents in two reversed orders. Each process warms 5,000 renders and measures 10,000 complete consumed streams. All eXact document hashes match. Values are mean microseconds per render, lower is better.

| Runtime | Document | Retained | Candidate | React |
| --- | --- | ---: | ---: | ---: |
| node | assets | 53.95 | 54.07 | 65.50 |
| node | large | 190.34 | 190.66 | 329.66 |
| bun | assets | 53.25 | 53.30 | 53.12 |
| bun | large | 288.31 | 288.16 | 280.81 |

The result is effectively neutral, with small variation in both directions. Extra readiness branches and a second completion form have no demonstrated practical benefit here, so the candidate is not integrated. This is not a minimum percentage requirement. No browser, cancellation, or full lifecycle validation is claimed for this rejected prototype. Existing production validation remains attached to the retained build.

Raw results, prototype generator, frozen artifact and provenance are in ready-stream-demand-2026-09-10-evidence.zip. The overall performance goal remains unmet.

Evidence archive: ready-stream-demand-2026-09-10-evidence.zip. SHA-256: `e090a5452a6fd6fbf6bab6f252ff20870c07cb4594d8eb5f2a9d87efad6d946c`. All owned experiment processes have exited.
