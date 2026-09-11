# Generated projection versus existing interpreter

Date: 2026-09-09. Production unchanged; retain generated projectors.

## Hypothesis

Generated positional projectors unroll schema field access but still call generic validation for
each primitive. Before adding further generated code, test the assumption that the generated lane
outperforms the existing positional interpreter on the current build. A neutral result would favor
investigating simplification; an interpreter regression would support keeping specialization.

## Experiment

The candidate changes only selection of the generated projector in the retained callback-current
bundle to undefined, invoking the existing interpreter instead. It preserves ordinary validation,
positional output, property reads and ownership checks, budgets, and escaping. The interpreter uses
its existing shallow ancestor tracker, while the generated lane requires a native Set. Therefore
this compares the complete existing lanes, not unrolling alone. No public contract is changed.

Sixteen fresh processes cover Node/Bun and string/consumed stream, with two reversed-order pairs
per cell. Each uses NODE_ENV=production, 5,000 warmups, 12,000 measured renders, the 96-incident
fixture, a complete application-authored document, and empty client tags. Both runtimes use the
same portable bundle. Response.text() consumes streams. All paired document hashes match.

## Results

Positive means the interpreter candidate takes longer. Two pairs are preliminary observations
on a variable-load workstation, not precise estimates. No HTTP or browser timing is measured.

| Runtime | Mode | Pair 1 time change | Pair 2 time change |
| --- | --- | ---: | ---: |
| node | string | -1.90% | +3.30% |
| node | stream | -0.44% | +0.41% |
| bun | string | +1.08% | +9.58% |
| bun | stream | -7.79% | +1.34% |

Node results are mixed or nearly flat. Bun strings favor generated projection in both pairs.
This provides no case for disabling generated projectors globally. It also does not demonstrate
a large universal benefit from generated projection. Further specialization needs its own measured
hypothesis rather than assuming compiler-generated code is necessarily faster.

Production remains unchanged. Fixture output equality does not replace failure and lifecycle
tests if a lane is redesigned. No package/browser tests were run for this diagnostic prototype.
No React population was run and no new React parity claim is made. The overall goal remains unmet.

The archive contains frozen bundles, fixed input, worker, builder, runner, raw results, reporter,
and a SHA-256 manifest.
