# Shell script lowering audit and scalar probe

Date: 2026-09-09. Production remains at the retained direct-map build.

## Compiler finding

unsupportedPlannedHost in jsx_render_program_lowering.go excludes script, style, template, and
other special hosts. The existing exception permits server document roots, not scripts. Consequently
the comparison Document's empty external module scripts use createCompiledIntrinsicReceipt,
including an element identity and a createExpression wrapper around the immutable map parameter.
The stylesheet list uses prepared render programs. compiledSsrAttribute already contains script
attribute-name normalization, but the host exclusion prevents this example taking that path.

## Narrow experiment

Before attempting a compiler change, a frozen-bundle probe replaces only `src: createExpression(
() => src)` with the scalar `src` at the one generated external-script site. The hypothesis is a
small saving from avoiding reactive wrapper construction and reading for this immutable parameter.
It does not compile the script, remove its identity, change its attributes, or modify authored code.
This site-specific probe is not a production optimization or a generic compiler proof.

Sixteen fresh processes: Node/Bun, string/consumed stream, two reversed-order pairs per cell.
NODE_ENV=production, 5,000 warmups, 12,000 measured renders, three incidents, complete authored
documents, two scripts and two stylesheet links. Both runtimes use the same portable artifact;
Response.text() consumes streams. All paired document hashes match. No HTTP/browser timing is run.

Positive means longer rendering time. Workstation variability was substantial, especially Node
strings. Two pairs do not support precise estimates or causal explanations for individual outliers.

| Runtime | Mode | Pair 1 time change | Pair 2 time change |
| --- | --- | ---: | ---: |
| node | string | +34.78% | -8.70% |
| node | stream | +1.17% | -12.56% |
| bun | string | +3.59% | -5.40% |
| bun | stream | +4.00% | -3.96% |

All cells are mixed across the two orders. The scalar-only change is not adopted or treated as
an established improvement. The result does not answer whether compiling the entire empty script
intrinsic would remove enough generic work to help.

## Next compiler experiment requirements

A broader candidate should be restricted initially to server-only empty external script roots,
preserving ordinary client lowering. It must preserve element identity, src sanitization, script
attribute spelling/order, enhancement routing, keyed ranges, and full-document hydration. Inline
script content and dynamic children must retain existing handling unless independently proven safe.
Client script execution and adoption must be tested in a real browser; matching HTML alone cannot
establish those semantics. Generic support must be implemented in the compiler, not by special-casing
the comparison application or its generated identifier names.

No production code or compiler binary changed. No package/browser regression tests were run for
this rejected scalar probe. The objective remains unmet. The archive includes artifacts, fixed
input, runner, builder, worker, raw results, reporter, and SHA-256 hashes.
