# Retained marker-key hex encoding improvement

Date: 2026-09-09. Change retained; overall React parity remains unmet.

## Asset-list investigation

Forty fresh string-rendering populations compared the retained compiled-script build with React
using zero, one, and four scripts or stylesheets. Both scenario and framework order reverse in
the second round. Each uses the same three-incident data, complete authored document, production
environment, 5,000 warmups, and 12,000 measured renders. These are Node-target artifacts on both
runtimes, not HTTP capacity. Asset presence and stable per-framework output hashes are checked.

Median microseconds per string render:

| Runtime | Asset fixture | eXact before hex change | React |
| --- | --- | ---: | ---: |
| node | scripts-0 | 36.35 | 23.64 |
| node | scripts-1 | 46.98 | 25.58 |
| node | scripts-4 | 55.39 | 27.02 |
| node | styles-1 | 38.98 | 26.32 |
| node | styles-4 | 37.46 | 25.14 |
| bun | scripts-0 | 35.61 | 32.87 |
| bun | scripts-1 | 39.65 | 33.25 |
| bun | scripts-4 | 49.05 | 36.38 |
| bun | styles-1 | 36.28 | 34.87 |
| bun | styles-4 | 40.10 | 36.57 |

Node measurements varied considerably, including the zero-asset control. Bun showed clearer script
scaling than stylesheet scaling. This is diagnostic evidence, not an exact per-item cost estimate.
Scripts retain keyed item markers for client adoption. Stylesheet programs can use their own
element boundary. URL keys contain slashes and cross the UTF-8 hex marker encoder.

## Implementation

encodeExactMarkerPart previously allocated a TextEncoder and an array of individually formatted
hex strings per encoded key. Core now shares one stateless encoder and a private 256-entry hex
lookup table and concatenates the encoded bytes directly. Safe direct keys and the UTF-8 hex wire
format remain unchanged. Lone surrogates retain TextEncoder's replacement semantics. There is no
cross-request key cache and no relaxation of marker grammar or validation.

The hypothesis was that removing encoder/temporary-array construction and repeated byte formatting
would improve the affected keyed-list workload. No numerical gain was preregistered. This was
tested first in a frozen-bundle prototype, then implemented in core and rebuilt for both targets.

## Rebuilt comparison

Sixteen fresh processes per batch, Node/Bun and string/consumed stream, two reversed-order pairs
per cell. Three incidents, two module scripts and two stylesheets, complete authored documents,
NODE_ENV=production, 5,000 warmups and 12,000 measured renders. Response.text() consumes streams.
All full response hashes match the prior build; no ordinal normalization is needed for this change.

Positive means longer rendering time. Two local pairs are not confidence bounds.

| Runtime | Mode | Rebuilt pair 1 time change | Rebuilt pair 2 time change |
| --- | --- | ---: | ---: |
| node | string | -12.96% | +3.32% |
| node | stream | -13.06% | +1.39% |
| bun | string | -7.62% | -4.90% |
| bun | stream | -7.57% | -3.79% |

All eight prototype pairs favored the candidate. Rebuilt Bun strings and streams improved in both
pairs. Rebuilt Node strings and streams each had one gain and one regression. The implementation is
retained for the direct allocation reduction, unchanged encoding, and repeated affected-path gains,
with that Node uncertainty explicitly accepted. This does not establish a universal speedup or
close the overall React gap. These percentages cannot be multiplied into historical HTTP RPS.

## Validation and cost

Core suite: 50 files, 252 tests passed. New coverage checks fixed canonical keys and UTF-8 hex
equivalence over ASCII, Unicode, lone surrogates, and sampled UTF-16 combinations. Core build and
native package compilation passed. The comparison client and Node/Bun servers rebuilt. Test
typecheck, ESLint for changed modules, compiled ABI, and platform boundaries passed. All 56
Node/Bun string/stream eXact/React browser correctness checks passed with the rebuilt client.

The lookup table adds constant module-lifetime storage for 256 hex strings and the shared encoder.
The comparison client gzip size rose from 62.16 to 62.20 kB in build output. No browser performance
claim is made. Public API, artifact semantics, and wire bytes are unchanged, so no ABI epoch change
is required. Engineering documentation records the implementation; public setup remains unchanged.

The archive preserves scaling/prototype/rebuilt measurements, source, tests, artifacts, browser
logs, fixed input, runners, and hashes. Other passing validation commands are recorded in the tool
transcript rather than raw log files. All task-owned processes exited.
