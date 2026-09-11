# Retained server compilation of empty external scripts

Date: 2026-09-09. Improvement retained; overall React parity remains unmet.

## Change and hypothesis

The compiler excluded every script host from render programs. An empty external script therefore
used a generic intrinsic, including a reactive src wrapper, while an adjacent stylesheet used a
compiled program. The hypothesis was that compiling the whole empty external script would remove
enough generic construction and attribute work to improve populated asset lists. No numerical
gain was preregistered. The preceding scalar-wrapper-only probe did not establish a gain.

The compiler now admits server-only script roots with an explicit src, explicit attributes, and
no children. It preserves the ordinary element ID. Spreads, refs, inline content, and enhancements
retain the existing path. Client lowering is unchanged; the rebuilt comparison client asset hash
stayed identical. The existing shared server renderer consumes the new program.

The first prototype passed native tests but failed all seven eXact Node-string browser cases.
The preserved trace reports a mismatched Document root: generic compiled-row handling incorrectly
omitted script item boundaries, while the unchanged client intrinsic expected them. The SSR target
now retains those boundaries for script programs. A focused regression test checks the boundary,
and all 56 browser checks passed after the fix. No performance result from the broken prototype
is presented as a valid improvement.

## Results on the rebuilt, corrected implementation

Sixteen fresh processes compare retained direct-map-current against compiled-script-current.
Node/Bun, string/consumed stream, two reversed-order pairs, three incidents, two module scripts
and two stylesheet links. Each population uses NODE_ENV=production, 5,000 warmups and 12,000
measured renders. Both runtimes use the same Node-target artifact and Response.text() for streams.
The application renders the entire document. These are renderer measurements, not HTTP RPS.

Positive means longer rendering time. Two local pairs are not confidence intervals.

| Runtime | Mode | Pair 1 time change | Pair 2 time change |
| --- | --- | ---: | ---: |
| node | string | -4.89% | -4.45% |
| node | stream | +0.08% | -6.25% |
| bun | string | -6.65% | -9.76% |
| bun | stream | -4.89% | -10.40% |

Both string pairs improved on both runtimes. Bun streaming improved in both pairs; Node streaming
was near-flat in one pair and improved in the other. This is evidence for retaining the focused
compiler improvement, not a claim of overall React parity or a guaranteed percentage for all apps.

Raw response hashes differ from the prior build. Inspection found only internal ordinal changes
in keyed-item and fragment markers; asset attributes, keyed identities, and remaining document
content match. The benchmark verifies complete output equality after normalizing only those two
marker ordinal fields and records both full and normalized hashes. Browser adoption is verified
independently. The first hash-check failure stopped the benchmark and was investigated before
the normalized check was introduced.

## Validation and contract review

Native exactcompiler/exactc tests and compiler binary build passed. Comparison client and both
server builds passed. SSR tests: 45 files, 284 tests passed. A new target regression protects
script keyed boundaries. ESLint passed for the changed SSR target and test. All 56 Node/Bun,
string/stream eXact/React browser correctness checks passed after the marker fix. These verify
actual loaded client assets and interactions; they are not browser performance measurements or
an exhaustive script execution-policy suite.

The final test typecheck, source architecture, platform boundary, compiled ABI, and released ABI
checks are recorded in the accompanying validation record. No released artifact was regenerated.
Engineering documentation and initial release guidance are updated. This compiler output requires
the matching runtime marker behavior, recorded as an initial 0.5.0 semantic contract change.
No public authoring API changed, so public docs-app pages and package READMEs need no new setup.

The retained direct-map optimization remains included. No full React/HTTP baseline was rerun for
this change, and its gains must not be multiplied into older RPS tables. The archive preserves the
corrected artifacts, initial failure evidence, source changes, worker, runners, fixed input, browser
logs, raw observations, and hashes. Reproduction requires the locked workspace and native toolchain.
