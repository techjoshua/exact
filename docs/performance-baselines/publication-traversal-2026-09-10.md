# Hydration traversal audit, September 10, 2026

Status: diagnostic audit. No production changes or new throughput claims.

The previous literal-projector experiment was progress: it supplied negative or
inconclusive cross-runtime evidence and redirected investigation away from array
construction. This audit tests whether duplicate publication or repeated object
validation provides a larger removable cost.

## Method

The retained Node artifact is instrumented at generic validation, interpreted
positional projection, and generated projector entry. A diagnostic Map counts
visits by object identity and stage. The final compacted envelope is captured
after validation. One small and one large document are rendered on Node 26.8.1
and Bun 1.4.2 and compared byte-for-byte with the ordinary implementation.

These counters allocate deliberately. They are not timing or allocation profiles.
Both runtimes execute the portable Node entry. No HTTP workers are involved.
Control SHA-256:
`2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.

## Findings

Counts agree on both runtimes:

| Observation                                        | Small, 3 incidents | Large, 96 incidents |
| -------------------------------------------------- | -----------------: | ------------------: |
| Generic validator calls, including primitives      |                 11 |                 683 |
| Interpreted positional calls, including primitives |                 40 |                 109 |
| Generated projector calls                          |                  0 |                  96 |
| Unique visited input containers                    |                 18 |                 111 |
| Input containers revisited within a stage          |                  0 |                   3 |
| Root-prop field JSON bytes                         |                652 |              10,200 |
| Resumption field JSON bytes                        |                 55 |                  55 |
| Complete envelope JSON bytes                       |                715 |              10,263 |
| Complete document bytes                            |              4,672 |              36,478 |

The three repeated containers are empty comment arrays. The large fixture uses
shallow copies of three input incidents, so each of those arrays is visited 32
times. There is no repeated nonempty object traversal in this fixture. Counts
do not justify general memoization: authored getters can mutate later values,
and identity reuse is not a promise that a value remains unchanged.

The envelope mask is 88: root state, markerless-root flag, and resumptions.
The root-prop field accounts for about 91% and 99% of the two JSON envelopes.
The resumption record does not republish the entire application data graph.

Source inspection confirms that positional validation builds final arrays;
serialization visits those arrays through native JSON rather than repeating
generic validation. Root publication copies the root prop record shallowly,
not the complete nested application graph. Removing positional arrays would
require a different encoding strategy, not merely deleting a duplicate clone.

## Consequence for the next experiment

No redundant full-data publication or second validation walk was found here.
The [earlier fused serialization experiments](ssr-hydration-fusion-2026-09-08.md)
already tested direct positional JSON and schema-specific writers without a
consistent benefit. This audit does not justify repeating those implementations.

The whole-stage cached-script HTTP diagnostic also changes string reuse,
allocation, and final response assembly. Its throughput difference cannot be
assigned entirely to validation and JSON work. The next investigation should
separate publication from downstream response materialization before changing
serialization policy or adding a request-local memoization structure.

## Evidence

The adjacent evidence ZIP contains the instrumenter, diagnostic and control
artifacts, input fixture, raw Node/Bun counts, report, and SHA-256 manifest.
All four complete-output comparisons pass. This audit does not replace public
serialization tests, browser checks, or full benchmark comparisons. The overall
performance objective remains unmet.
