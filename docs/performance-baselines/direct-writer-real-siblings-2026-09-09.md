# Direct writer with compiled scheduled siblings

Date: 2026-09-09. Experimental integration checks; production unchanged.

The direct-writer sibling preparation prototype now has a real scheduled-component test. The
native compiler emits a child with a blocking server task, a shared test gate, settled reactive
state, and an unmount callback. Its leaf SSR writer is adapted to receive the prototype's fourth
output argument; task activation, state updates, execution contract, and lifecycle code remain
compiler-generated. The fixture imports the built workspace runtime through normal package imports.
Realm-stable execution-frame identities allow those helpers to use the prototype's request frame.

The parent program is hand-built against the experimental writer ABI. It calls the actual sibling
preparation function through the operation target and traverses the actual component references.
This tests real task construction and disposal, but does not yet test native compiler emission of
the parent's proposed preparation phase. It is not a complete public SSR API or HTTP test.

Six cases pass: Node and Bun, each with success, failure before visiting the second child, and
request cancellation while the task gate remains closed. In every case:

- Both compiled tasks start before either is allowed to finish.
- Both component disposal callbacks run exactly once in total per component.
- The document host stack is empty at completion.

Success produces `<section><strong>Ready 1</strong><strong>Ready 2</strong></section>`. Failure
preserves the original error and disposes the prepared but unvisited second component. Cancellation
rejects with AbortError before the gate opens, with a two-second test deadline to detect a hang;
the timer and gate are released in cleanup. The test records disposal counts of two, not allocation
bytes or a throughput result.

This closes the specific real-task validation gap left by the synthetic preparation callbacks in
the preceding report. It does not cover stale generations, enhancement capture, every component
boundary, general component-slot preparation, backpressure, or early head publication. The prototype
still derives from the older experimental direct-writer build and must be rebased on all retained
production improvements before performance comparison or adoption. No production source changed,
and no new package, browser, or benchmark result is claimed. React parity remains incomplete.

The evidence archive preserves the original compiler request/response, emitted/adapted fixture,
prototype entry, build and audit scripts, both runtime results, selected workspace runtime sources,
and a verified SHA-256 manifest. Fixture imports require built workspace packages; this is not a
standalone package distribution.
