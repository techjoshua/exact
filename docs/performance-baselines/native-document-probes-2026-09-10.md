# Native document probes, 2026-09-10

Rejected experiment: native startsWith for a complete document prefix and endsWith for a complete lowercase closing suffix, retaining generic split-tag/mixed-case scanning. Hypothesis: a 1-3% improvement in finalization, particularly for Bun strings. Components and sinks remain independent of render mode.

Production Node 26.8.1, Bun 1.4.2, React 19.2.0. Each cell averages two fresh processes in reversed order, with 5,000 warmups and 12,000 measured renders per process. Full app-owned documents include four asset tags; streams are fully consumed. These are in-process timings, not HTTP throughput. Small documents contain three incidents and large documents 96. Complete eXact document hashes match the saved += control.

| Runtime | Mode   | Document | Previous (µs) | Native probes (µs) | React (µs) |
| ------- | ------ | -------- | ------------: | -----------------: | ---------: |
| node    | string | assets   |         36.93 |              35.80 |      23.05 |
| node    | string | large    |        167.74 |             169.19 |     131.58 |
| node    | stream | assets   |         56.23 |              57.46 |      68.21 |
| node    | stream | large    |        198.16 |             195.40 |     341.43 |
| bun     | string | assets   |         36.31 |              38.09 |      32.55 |
| bun     | string | large    |        233.25 |             226.92 |     188.60 |
| bun     | stream | assets   |         49.87 |              51.49 |      53.35 |
| bun     | stream | large    |        280.06 |             279.19 |     268.68 |

The candidate improved large Bun strings but regressed small Bun strings and streams. It did not establish a general benefit on the shared workstation. The probe changes were removed; retained production source keeps the += sink and previous finalizer. No component-side sink-type branch was introduced.

Validation: candidate package build and three focused output-result tests passed, including all split positions, mixed case, missing closing tag rejection, and chunk-preserving hydration insertion. The prior source was restored, rebuilt, and the focused tests passed again. No broad browser or HTTP benchmark was run for this rejected change.

Next architectural target, confirmed in current source: packages/ssr/src/render/render-program.ts invokes a three-argument compiler writer and returns its segment array. generatedSsrOperations.output still allocates that array, and operation-target.ts then visits the prepared segments. The native compiler already has an experimental four-argument continuation writer in jsx_render_program_ssr_continuation.go, but packages/core/src/render-program.ts still defines the three-argument array-returning contract. Integrating caller-owned output requires migrating compiler, core types, runtime, scheduling/capture ownership, tests, and initial-release ABI documentation together. This migration is not completed by the probe experiment.

Raw samples, exact measured bundles, and the harness are archived. Overall React parity remains unfinished.
