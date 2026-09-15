# Complete-string sink collection, 2026-09-10

The string sink now retains incoming string references and joins once at completion. It has no intermediate capacity flush. Late resource hints participate in the final join; exact UTF-8 output limits and cleanup remain enforced. The shared renderer is unchanged by this sink policy.

Hypothesis: removing intermediate materialization should simplify collection and may reduce concatenation-chain overhead. This experiment measures elapsed rendering time, not allocation counts or garbage collection.

Production builds, Node 26.8.1 and Bun 1.4.2, React 19.2.0. Each cell averages two fresh processes in reversed variant order, each with 5,000 warmups and 12,000 measured complete app-owned document renders. These are in-process string timings, not HTTP throughput. eXact document hashes match across policies. Small documents use three incidents; large documents use 96. Both include four asset tags.

| Runtime | Document | Concatenation (µs) | One join (µs) | React (µs) |
| ------- | -------- | -----------------: | ------------: | ---------: |
| node    | assets   |              36.71 |         36.34 |      22.08 |
| node    | large    |             166.49 |        167.96 |     134.17 |
| bun     | assets   |              35.55 |         36.38 |      32.64 |
| bun     | large    |             229.79 |        224.76 |     186.77 |

Two samples per cell on a shared workstation do not establish small differences as repeatable wins. One join is retained as the simpler complete-string collection policy. React remains faster on these string workloads. No claim of reduced GC is established.

Validation: 315 SSR tests passed, package build, repository test typecheck, focused ESLint, source architecture, platform boundaries, and package contents passed. Directly invoking stock TypeScript against the package fixture configuration was an incorrect check (it lacks native JSX support); the repository test typecheck passed. Tests cover final UTF-8 limits, split surrogates, hints, cancellation, and publication boundaries.

Public document streams still collect their tree output before shell publication. This change does not claim progressive head publication during public tree traversal. The native writer ABI experiment remains separate.

The accompanying archive contains raw results for this experiment and the preceding intermediate-batching experiment, harnesses, exact measured bundles, and the string sink source/tests. Main comparison application outputs were not replaced.
