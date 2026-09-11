# Document hydration ownership audit, September 10, 2026

Status: implementation investigation following the combined-shell prototype. Execution-local
resumption capture plumbing is now implemented and tested; the public shell boundary and complete
hydration scoping remain unimplemented.

The requested render component should own application hydration. A surrounding server-only document
should render through the same engine without becoming part of that publication. An authored
document explicitly hydrated as the root remains a valid, different ownership choice.

## Findings motivating the capture refactor

`render/root-props.ts` reads the root receipt independently for props schema, capture input, and
component identity. `render/render-output.ts` installs a request-wide resumption capture before
traversing the rendered operation. The current comparison explicitly passes `Document` as that
operation and explicitly hydrates `Document` in its client entry. Publishing document props is
consistent with that caller today; silently switching it to an arbitrary child would be incorrect.

`DirectSsrResumptionCapture.reserveDirect()` accepts every resumable contract in the traversal.
Its root identity argument selects input deduplication, not a subtree exclusion boundary. Changing
that argument and root props does not prevent a stateful shell or a sibling outside the application
from publishing records. The combined diagnostic's shell does not exercise that case.

`render/direct-component.ts` skips reservation altogether for stateless components. Consequently,
starting capture at the first matching reservation would miss a stateless application root and
cannot define ownership correctly. Component execution, rather than state serialization, must
establish the boundary.

`render/direct-component-output.ts` also uses the presence of capture to decide whether a resumable
child needs its own boundary. Disabling capture outside the application without defining server-only
publication could accidentally create independent hydration boundaries in the shell. Both decisions
must follow the same scope.

The boundary includes the hydration table, root marker policy, contexts needed by client descendants,
and deterministic resumption order. Shell task execution, cancellation, cleanup, and document
head/body normalization still belong to the request. They must continue even when the shell's own
state is not published.

## Implemented prerequisite

Resumption reservation, publication, rollback, and task publication dependencies now read the
options passed to their component execution. `SsrContext` no longer stores a competing capture
reference. Component marker publication records capture availability from those same options.
This allows two executions sharing output state to target separate capture objects without
mutating that shared context or allocating a cloned context per component.

A regression test passes one scope's options to a stateless parent with a scheduled stateful
descendant while sharing output context constructed from another scope. After suspension, only the
execution's assigned capture contains the descendant's state and cleanup runs once. The previous
context-based lookup would publish to the wrong capture. See
[validation and timing](execution-scoped-capture-2026-09-10.md).

## Implementation direction and acceptance cases

The integration investigation also found that an internal head flush was not reaching the public
progressive HTML consumer. That boundary is now connected, with consumer-level pending-task and
cancellation tests. See [the early-head report](early-document-head-2026-09-10.md). Its final local
comparison showed a streaming cost and a Bun string slowdown, so performance work remains open.
Root document recognition now uses the existing component executor and writer target at the
progressive root only. A following sink change removes duplicate head accumulation. Both preserve
the verified early-head behavior. Their paired results are recorded in
[the root and sink report](shared-head-string-2026-09-10.md); they do not establish a broad speedup.
The main remaining integration is the explicit application hydration boundary described below.

Keep the requested application receipt as the publication source. Give the shared traversal an
explicit enclosing-document relationship and an application subtree boundary. Do not infer the
application by component name, by first state record, or by inspecting arbitrary component children.
Do not create a second renderer or serialize shell content independently into an HTML string.

Scope capture and boundary emission at component execution, preserving scope over pending tasks,
speculative retries, and independent sibling work. A mutable global capture toggle is insufficient
when independently executing branches can overlap. Repeated insertion or omission of the requested
application must have defined behavior rather than accidentally producing ambiguous root metadata.

Required validation includes stateful shell plus stateless application, stateful siblings outside
the application, application descendants with tasks and contexts, suspension and cancellation,
rollback without leaked records, markerless and marked roots, and actual browser DOM adoption.
An explicitly hydrated reactive document must retain its existing behavior. String and stream
must share these semantics while streams retain early head delivery.

Performance evidence for pursuing this work is in
[the combined-shell report](combined-shell-2026-09-10.md). The current Node string gap remains open;
these findings do not certify the prototype as a general framework implementation.
