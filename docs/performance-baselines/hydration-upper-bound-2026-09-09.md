# Hydration cost upper-bound diagnostic, September 9, 2026

Hydration serialization alone cannot close the measured string-rendering gap to React.
Even an unrealistic diagnostic that reuses the complete first hydration serialization leaves
large eXact documents slower than React with its normal serialization still enabled.

## Method

The current four-change renderer from [the allocation investigation](ssr-allocation-2026-09-09.md)
is compared with an isolated artifact that caches the first hydration script and its byte count.
The component tree still renders every iteration. A matching React diagnostic caches only its
initial-data JSON string. The fixed input makes response bodies identical within each framework;
the runner checks their SHA-256 hashes for every paired population. Both retain full document shells.

This deliberately bypasses request-dependent work and is not a valid production optimization.
It measures a rough upper bound on the work removed by the diagnostic, including eXact hydration
metadata construction, positional validation/projection, serialization, escaping, and byte counting.
Root prop preparation and component-state capture before the hydration function remain in place.
Caching also changes allocation and garbage collection, so this is not an exact timing decomposition.

Node 26.8.1 and Bun 1.4.2, NODE_ENV=production, string output, the same portable Node-targeted
participant artifacts on both runtimes. Three rotated orders, 5,000 warmups and 12,000 measured
renders per population: 48 populations. Small has three incidents, large has 96. Client asset tags
are empty. React resolves to version 19.2.0 from framework-comparison/node_modules.

Median microseconds per complete document, lower is better:

| Runtime | Workload | Current eXact | Diagnostic eXact | Current React | Diagnostic React |
| ------- | -------- | ------------: | ---------------: | ------------: | ---------------: |
| node    | small    |         42.42 |            34.83 |         27.65 |            25.28 |
| node    | large    |        310.86 |           203.25 |        184.37 |           156.93 |
| bun     | small    |         40.91 |            34.89 |         35.44 |            34.09 |
| bun     | large    |        370.49 |           298.14 |        225.66 |           190.40 |

## Consequence for the next experiment

Continue investigating component rendering and output assembly rather than expecting hydration
alone to deliver parity. The current compiler emits prepared program objects and eager value arrays;
the renderer then invokes each generated writer to create segment arrays and traverses those arrays
to render deferred children. That materialization boundary is a concrete candidate for compiler-led
fusion. A useful experiment must preserve evaluation order, pending task issuance, document ancestry,
inspection callbacks, and cleanup while using the same renderer for both sinks.

No runtime, compiler, application, or React production source changed in this diagnostic.
No new browser performance or HTTP throughput result is claimed. The temporary React artifact was
removed by the runner's finally block. The performance goal remains unmet.

[Raw populations and medians](hydration-upper-bound-2026-09-09.json) and
[reproduction evidence](hydration-upper-bound-2026-09-09-evidence.zip) accompany this report.
The archive requires the repository's locked dependencies; it is not a standalone distribution.
