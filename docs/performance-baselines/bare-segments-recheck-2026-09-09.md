# Segment wrapper recheck on the current renderer

Date: 2026-09-09. Bundle prototype only; production unchanged.

This removes the internal `{ segments: output }` wrapper and changes its two callers to consume
the array directly. No compiler helper, traversal, or lifecycle implementation changes. The
hypothesis is a small allocation saving. This is a repeat of the earlier segments-only experiment,
identified after starting this run, not a new architectural discovery. The earlier confirmation
found mixed results and explicitly recommended moving to larger sources of work.

The current control includes text-surroundings folding and the retained empty-cleanup optimization.
Thirty-two fresh production processes cover Node/Bun, string/consumed stream, three/96 incidents
with four assets, and two reversed-order pairs per cell. Each has 5,000 warmups and 12,000 measured
renders. Full document hashes match in every pair. No completed populations were discarded.
Positive percentages mean slower rendering; these are local timings, not HTTP rates.

| Runtime | Mode   | Fixture | Pair 1 time change | Pair 2 time change |
| ------- | ------ | ------- | -----------------: | -----------------: |
| node    | string | small   |             -0.22% |             +0.07% |
| node    | string | large   |             -1.45% |             -1.47% |
| node    | stream | small   |             +1.43% |             -0.17% |
| node    | stream | large   |             -1.69% |             -2.85% |
| bun     | string | small   |             -5.06% |             -0.08% |
| bun     | string | large   |             -5.56% |             -1.50% |
| bun     | stream | small   |             -2.13% |             -0.63% |
| bun     | stream | large   |             -0.01% |             -1.22% |

These observations are preserved separately from the older measurements because the build and
asset workload differ. They do not establish that removing one wrapper closes the React gap.
No production change, new package validation, browser test, or React comparison is claimed.
Acceptance remains open pending consideration alongside the earlier mixed confirmation and
validation of the source change. Do not repeat another wrapper timing round without a specific
new reason. Work should return to removing intermediate traversal stages and enabling ordered
publication through the shared renderer.

The archive includes frozen control/candidate, runner, builder, worker, fixed input, all raw
observations, this reporter, and a verified SHA-256 manifest. The prior retained build remains
current. The overall goal remains incomplete.
