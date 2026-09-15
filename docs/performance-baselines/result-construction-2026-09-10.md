# Shared result construction follow-up, September 10, 2026

Status: individual descriptor installation is the current integrated candidate. Direct-construction variants remain out. Cross-mode performance acceptance is still incomplete, and the overall objective remains unmet.

## Direct construction

The hypothesis was that Object.create with shared accessor descriptors could avoid redefining placeholder properties and reduce Bun construction overhead without losing Node's GC benefit. Two asserted bundle variants were tested against the integrated descriptor-map candidate from result-storage-2026-09-10.md. Both use the same shared rendering engine and lazy result storage.

The first variant created own accessors and then assigned state/hydrationScript. A targeted Node/Bun audit found that inherited setters could intercept those assignments. This behavior differs from the existing object-literal initialization, so that variant cannot be adopted. The corrected variant includes own writable data slots in its shared descriptors before assignment. Both existing and corrected implementations pass that audit without interception, along with enumeration, prototype and lazy-read checks.

Each timing screen uses 16 fresh production processes: Node/Bun, three/96 incidents, two reversed orders, 50,000 warmups and 20,000 measured renders. Documents include four asset tags and full application-owned shells; output hashes match. Mean microseconds/render:

| Variant   | Runtime | Fixture      | Descriptor-map control | Direct construction |
| --------- | ------- | ------------ | ---------------------: | ------------------: |
| Initial   | Node    | 3 incidents  |                  23.48 |               23.01 |
| Initial   | Node    | 96 incidents |                 136.60 |              134.72 |
| Initial   | Bun     | 3 incidents  |                  28.64 |               28.24 |
| Initial   | Bun     | 96 incidents |                 218.54 |              218.18 |
| Corrected | Node    | 3 incidents  |                  23.38 |               23.38 |
| Corrected | Node    | 96 incidents |                 135.05 |              138.31 |
| Corrected | Bun     | 3 incidents  |                  28.32 |               28.57 |
| Corrected | Bun     | 96 incidents |                 230.17 |              225.90 |

The corrected variant has mixed results and does not establish the intended consistent reduction in construction cost. It remains out. The initial variant's results are retained as evidence, not an acceptable implementation.

## Individual descriptor installation

A narrower candidate keeps the existing object-literal data slots and private storage, but installs shared own getters with individual Object.defineProperty calls instead of Object.defineProperties. This avoids descriptor-map enumeration without changing result shape, ownership or getter behavior. Source integration changes only output-result.ts; no compiler signatures or artifact semantics change.

Eight fresh processes screen small-document string rendering with the same warmup/measurement counts and reversed orders. Node averages 24.24 microseconds for descriptor maps versus 24.41 for individual descriptors, effectively flat at this precision. Bun averages 29.29 versus 28.05, with both pairs faster. These screens motivate HTTP investigation rather than establishing a universal gain.

The integrated Bun HTTP capture compares four variants in two reversed orders. Each fresh process warms ten seconds, measures six seconds, and uses two drivers at concurrency 16 each. Frameworks render their full documents and four asset tags. Whole-response identity is verified throughout; all measured responses pass with zero errors.

| Variant                                    | Requests/s |
| ------------------------------------------ | ---------: |
| Previous closure-based result factories    |     7827.0 |
| Shared getters with descriptor maps        |     7781.7 |
| Shared getters with individual descriptors |     7882.3 |
| React                                      |     8162.6 |

Individual descriptors average 1.3% above descriptor maps and 0.7% above the old closure implementation, but pair directions are mixed. The candidate remains 3.4% behind React. These small HTTP differences are weaker evidence than the earlier Node GC reduction, and do not erase the earlier Bun regressions. All observations remain archived.

## Current source and validation

The individual-descriptor variant is in the working source and rebuilt comparison applications. All five result tests pass, along with the package TypeScript build, targeted ESLint and formatting checks. All 56 browser checks pass again across Node/Bun string/stream. The preceding representation change's broader 352-test SSR run and ABI/quality checks remain documented separately; they are not claimed as a new full run for this refinement.

Node artifact SHA-256: `069f9784fa667af7896202923a6c08622ae1bb3f4060054328314dbe1ae6619b`.
Bun artifact SHA-256: `90f60a41d7095afd77765ce5d4abb336ceadd938dc2415355b56a24b989f17f5`.

The subsequent [cross-mode HTTP capture](result-storage-cross-mode-2026-09-10.md) confirms a Node string gain but finds another Bun string regression. Cross-runtime acceptance remains unresolved. No public documentation update is needed for unchanged ordinary result usage.

## Instance-bound writer investigation

The user's next suggestion is to invoke each component's render program with its instance as the receiver through call or apply. Current source already calls the component preparation function with server.render.call(frame, props). The later compiled writer instead receives generated operations, request context, a prepared invocation containing eager values, and its output object explicitly. Thus changing call syntax alone would not remove the existing allocations.

The useful next investigation is whether the actual component frame can replace some prepared-invocation or callback storage while preserving eager evaluation, task preparation order, ownership and suspension. Compiler-proven stateless components currently share a stateless frame, and static invocations can be hoisted; introducing a new mandatory per-component allocation would need to justify its cost. No instance-bound writer redesign was implemented in this experiment.

Evidence: `result-construction-2026-09-10-evidence.zip` contains frozen variants, construction/audit/measurement scripts, timing captures, HTTP results, current source and browser logs. All owned processes closed.
