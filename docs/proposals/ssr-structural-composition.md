# Compiler-composed SSR structural blocks

Status: not adopted for the initial prerelease. Not implemented or part of the public API.
The [completion decision](../ssr-completion.md#closed-experiment-decisions) records the
contradictory performance evidence and missing semantic coverage. The design below is retained
as a historical proposal, not an outstanding implementation commitment for this release.
This proposal follows the [component trace](../performance-baselines/component-boundary-trace-2026-09-10.md)
and [publication audit](../performance-baselines/root-publication-source-audit-2026-09-10.md).
It does not replace the shared rendering engine or alter component ownership.

## Problem and intended result

The compiler already combines ordinary nested intrinsic markup. Structural JSX
and dynamic document children can still become independently prepared programs,
then traverse child groups before writing to the same sink. In the traced small
document, Document and IncidentDetail own 15 of 24 writer executions and 17 of 21
child-group traversals, excluding descendant components.

Compose eligible structural positions into the containing component's generated
writer. Preserve expression evaluation, validation, scheduling, document ancestry,
hydration identity, limits, and cleanup. Remove intermediate program and child-group
construction where those objects only describe a statically known call position.
Keep data-dependent iteration and request-owned execution state.

## Compiler audit

`jsx_render_program_lowering.go` deliberately delegates nonstatic document children
to `documentProgramChild`, preserving their client adoption boundaries. Structural
expressions likewise become child slots. Simply relaxing those guards does not
establish equivalent adoption or execution order.

`directRenderProgramSsrPlan` currently prepares its slots before emitting that
program's writes. Combining programs must not move a descendant's validation or
scheduled-reference preparation to its parent's entry. That could delay the head,
change which error appears first, or start work at a different time.

The frozen artifact's static construction inventory has six program call sites
in Document and nine in IncidentDetail. These are source sites, not the dynamic
counts in the trace. Server range callbacks are eager: the server helper invokes
`compute()` immediately. The initial proposal incorrectly inferred deferred
evaluation from callback syntax. Capture and writer execution remain distinct:

| Position                                                     | Current evaluation point                             | Composition requirement                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Document html/head/body/div capture values                   | Component preparation                                | Retain capture order and values before writer traversal.                                                        |
| Document script and stylesheet lists                         | Eager callback during component preparation          | Keep asset parsing and item evaluation before output. Preserve script versus stylesheet order and key coercion. |
| Detail selected incident branch and ordinary captured values | Component preparation                                | Keep branch selection and eager reads at that point.                                                            |
| Detail conflict/error predicates                             | Eager callback during component preparation          | Retain captured state values; do not reread them during traversal.                                              |
| Detail comments mapping                                      | Component preparation through ordinary array mapping | Preserve complete eager mapping and evaluation order. Do not turn it into streaming iteration.                  |
| Component references in app wrapper and detail heading       | Containing program's preparation prefix              | Preserve sibling preparation before the program writes its first span.                                          |

## Representation and execution

Add an internal compiler representation of a structural block with separate
capture and execution schedules. It should name captured operands, existing
marker identity, required host transitions, child preparation ownership, and
pending continuation points. It is compiler IR, not a runtime topology interpreter.

Generate direct calls or inline statements from that representation. A captured
conditional branch may use a discriminator and captured operands. Server range
callbacks may be lowered into the eager capture schedule when equivalent. Do not move an authored read merely to avoid an array.
For eager lists, retain the required per-item captures before serial output. The
initial objective is removing unnecessary wrappers and redispatch, not removing
all arrays irrespective of semantics.

Keep local preparation/validation prefixes at their former execution positions.
For blocks that own prepared siblings, retain a scoped cleanup owner through
completion or failure. A leaf block with no preparation must not accidentally
consume or dispose the containing block's preparation. Preserve the distinction
between component identity, keyed identity, and a structural program boundary.

Host enter/leave and head flush remain explicit operations with balanced cleanup.
The existing generated continuation machinery must save the active block's live
values on real suspension and resume in the same owner and sink. Ready writes
continue synchronously. Components never branch on string versus stream mode.

Enhanced, selected, or otherwise unproven positions continue through their
appropriate shared boundary operations. This is semantic specialization within
one engine, not a compatibility implementation for unreleased callers.

## Experiment scope and hypothesis

The first complete prototype should cover both Document's structural positions
and IncidentDetail's selected branch, including their lists and range captures.
It must keep dynamic assets and application hydration ownership unchanged.
The existing three-fragment prototype is too narrow and does not prove this design.

Working hypothesis: removing a substantial portion of structural construction
and traversal could yield approximately 3-6% HTTP throughput improvement. This is
a planning estimate, not a threshold for accepting good changes or a measured
prediction. The profile's execution/ownership groups include required work, and
the larger Node string deficit likely needs additional improvements. A count-only
reduction without a runtime improvement remains a diagnostic result.

Before timing, verify the executed construction/traversal reduction, full output,
and evaluation schedule. Compare actual HTTP output on Node and native Bun with
the retained build and React, using the existing paired order and process owners.
Do not rely on a `Response.text()` loop as a substitute for Node HTTP consumption.

## Acceptance boundaries

Tests should protect the semantic changes: capture versus execution reads and error
order; independent sibling task start order; pending work at each composed block;
prepared-sibling disposal on rejection, cancellation, and pressure failure;
concurrent request isolation; node/depth/output limits; document host claims;
head delivery before a pending body task; and keyed/conditional client adoption.
Keep observation hooks and hydration resumption order covered at component scope.

Compiler helper/artifact changes require initial 0.5.0 ABI review and coordinated
compiler, runtime, tests, and engineering documentation updates. Browser acceptance
must include full authored documents, generated shells, dynamic assets, hydration,
and interactions. No public docs should imply availability before implementation.

The static inventory and its generator are preserved with the adjacent performance
evidence at `docs/performance-baselines/structural-composition-plan-2026-09-10-evidence.zip`.
