# Same-worker hydration stage substitution, 2026-09-10

## Finding

Replacing fixed hydration results improves Node string HTTP throughput in both
worker populations. JSON encoding is the strongest individual stage tested.
Whole hydration publication has additional headroom. This locates worthwhile
work but does not establish the dominant cause of the entire HTTP gap, nor that
an equivalent production optimization can recover the substitution gains.

## Method

Use the integrated current artifact, one shared renderer and the existing Node
HTTP adapter. The application component tree renders on every request. Each
worker switches between normal execution and a single precalculated stage,
using one fixed input. Each treatment is bracketed by normal execution. A second
fresh worker reverses treatment order. Compare treatments with the arithmetic
mean of their adjacent normal blocks, not another worker. Each block runs two
drivers with 16 concurrent requests each for three seconds, after ten seconds
of HTTP warmup per worker. Drivers restart between blocks.

Before and after each HTTP block, the same worker also performs isolated render
loops with 10,000 warmup and 10,000 measured renders. Cache priming is separate
for HTTP and isolated loops to preserve their different pathname string
representations. Stage counters verify which operations execute. Instrumentation
and reuse can affect optimization, allocation, GC and downstream costs, so these
are diagnostic results, not publishable framework comparison scores.

Substitutions:

- Validation/projection: reuse the projected compact payload at the validation boundary.
- JSON: reuse the JSON string; run normal projection and escaping.
- Escaping: reuse the escaped JSON; run normal projection and JSON encoding.
- Whole publication: reuse the complete hydration script; retain tree rendering,
  state capture, final document assembly and HTTP delivery.

No user input is cached in production. Cached validation is not a proposal to
remove framework validation. These diagnostic substitutions are valid only for
the fixed fixture. Ten parity checks cover ordinary and escaped script content.
All 533,879 measured HTTP responses match the complete 4,672-byte document
identity; zero errors. Artifact and adapter hashes are verified before/after.

## Paired HTTP results

| Stage | Worker | Normal RPS | Substituted RPS | Change |
| --- | ---: | ---: | ---: | ---: |
| json | 1 | 9,202 | 10,197 | +10.81% |
| json | 2 | 9,705 | 10,484 | +8.02% |
| escape | 1 | 9,524 | 9,806 | +2.96% |
| escape | 2 | 9,593 | 9,892 | +3.12% |
| validation | 1 | 9,745 | 10,136 | +4.01% |
| validation | 2 | 9,457 | 9,578 | +1.28% |
| hydration | 1 | 9,786 | 11,269 | +15.16% |
| hydration | 2 | 9,255 | 11,229 | +21.32% |

## Render duration within each setting

Arithmetic means of both worker comparisons, microseconds per render. HTTP
figures use the benchmark render timer, not exclusive CPU samples.

| Stage | Normal isolated | Substituted isolated | Normal HTTP | Substituted HTTP |
| --- | ---: | ---: | ---: | ---: |
| json | 24.67 | 22.53 | 50.21 | 44.25 |
| escape | 24.15 | 23.50 | 49.86 | 47.90 |
| validation | 24.13 | 23.47 | 49.67 | 46.89 |
| hydration | 24.42 | 22.65 | 50.00 | 38.31 |

The treatment savings are not additive. Whole-stage reuse changes more
allocation and string construction than its individual substitutions. It also
still leaves substantial HTTP-versus-isolated render overhead. Next, separate
metadata assembly/state capture from encoding, and use controlled substitutions
at the document rendering and response-adapter boundaries. Preserve complete
output and lifecycle ownership when isolating those stages.

## Previous shared-callback HTTP confirmation

The separately completed integrated callback screen produced the following
means. It uses separate workers per implementation and therefore remains
susceptible to the demonstrated worker bias. The Node regression signals below
must not be hidden by allocation reductions or treated as causal proof.

| Mode | Previous eXact RPS | Integrated eXact RPS | React RPS |
| --- | ---: | ---: | ---: |
| node string | 9,877 | 8,646 | 11,250 |
| node stream | 8,346 | 7,422 | 4,616 |
| bun string | 10,298 | 10,693 | 11,129 |
| bun stream | 8,292 | 8,502 | 8,830 |

The integrated change remains provisional. This screen does not resolve its
Node throughput tradeoff; it is not an accepted general HTTP improvement.
The hydration substitution experiment uses that integrated artifact consistently
and makes no comparison against React from a different run.

## Evidence

The adjacent ZIP includes raw results, scripts, diagnostic and current artifacts,
fixture, checks, prior integrated HTTP results and a verified SHA-256 inventory.
Dependencies are workspace-owned, not a standalone distribution.
