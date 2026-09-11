# Structural composition prototype, first stage

Status: isolated generated-artifact prototype. No production source or canonical
build changed. No timing workload ran. The broader
[composition design](../proposals/ssr-structural-composition.md) is not complete.

The prototype combines the earlier dynamic shell composition with direct calls
to four detail blocks: heading, facts, analysis, and comments. Captured values
remain in their original expression positions. Eager server child-range captures and
list containers remain intact at this stage. Dynamic assets, component execution,
and hydration ownership remain part of the rendered document.

Unlike the old three-leaf detail experiment, each directly called block uses
`renderProgramWriter` to retain an independent preparation lifetime. This matters
for the heading's SeverityBadge reference: borrowing the containing output's
preparation field would conflate sibling cleanup scopes. The shell composition
still needs separate adversarial review of its preparation scope before this
prototype can satisfy the design's lifecycle requirements.

The transform reuses original generated writer bodies, adapts their captured-value
accesses, and adds hoisted invocation bridges. It removes the prepared-program
wrapper and generic child dispatch for those four positions. It does not yet
inline their statements into the containing writer. This is an intermediate
construction/ownership check, not the complete proposed optimization.

## Checks and work counts

Eight shell output comparisons and ten combined output comparisons pass. Combined
checks cover string and stream, changing titles, assets, empty comments, and a
missing incident. Traced ready string, ready stream, and forced-pending head flush
match the uninstrumented candidate and the corresponding retained output hashes
at 4,672 bytes. The forced-pending case is a promise injected at head flush, not
network pressure or pending application task coverage.

Ready string and stream have the same following counts:

| Work | Retained | Prototype |
| --- | ---: | ---: |
| Prepared program constructions | 22 | 15 |
| Writer executions | 24 | 21 |
| Child-group renders | 21 | 20 |
| Component executions | 8 | 8 |
| Scheduled-sibling preparation calls | 6 | 6 |
| String sink writes | 89 | 89 |

These are function-entry counts, not allocated bytes or CPU time. Retaining the
independent output lifetime means the four detail blocks still execute their
writer boundary. Only shell composition removes writer entries here. The modest
child-group reduction confirms that this stage has not eliminated the structural
traversal concentration identified in the previous trace. It should not be timed
as though it implements the full design.

A source review caught an overly strict null check in the prototype's
component-prop preparation helper. It was corrected to match the existing helper,
which accepts null at that preparation stage. Combined output and trace checks
were rerun after correction. Those checks do not replace full validation coverage.

## Remaining implementation

Continue from this prototype to the asset/range and eager-list positions
while preserving their original capture order. Remove the intermediate
traversal where proof permits, rather than merely replacing its record type.
Retain marker identity, host accounting, and block-local pending continuations.

Before timing, compare capture/execution expression and failure order, preparation
disposal, cancellation, and node/depth/output limits. Then validate browser
adoption and actual HTTP performance across the required runtimes and sinks.
The current output checks do not establish those requirements. No throughput
gain or production acceptance is claimed.

The adjacent archive contains the transformation sources, frozen controls and
prototype artifacts, output checks, trace script, traces/summaries, this report,
and a verified SHA-256 manifest. Earlier experiment artifacts remain unchanged.
