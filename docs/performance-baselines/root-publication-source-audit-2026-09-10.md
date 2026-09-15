# Root execution and publication source audit

Status: source audit of the retained implementation, not a new performance
experiment. No renderer, compiler, adapter, or canonical artifact changed.

This follows the [results interpretation](ssr-results-interpretation-2026-09-10.md)
and [actual HTTP profile](http-gap-attribution-2026-09-10.md). The purpose is to
identify work a composed root program could eliminate, rather than assume that
another cache or fewer source allocations will improve throughput.

## What already happens once

- `packages/ssr/src/resumption-serialization.ts` caches resumption schemas by
  component contract. Field-path splitting, input/default maps, and continuation
  sets are constructed when the schema is first requested, not on every request.
- `packages/ssr/src/resumption.ts` reserves compact tuples and publishes captured
  fields directly into them. `serializedRecords()` returns the records. It does
  not serialize or reconstruct them. Public activation objects are deferred until
  observed, except when the extension path explicitly needs them.
- `packages/ssr/src/render/root-props.ts` marks the root publication for positional
  validation. The publication pipeline validates/projects that graph before its
  final JSON serialization. It is not independently JSON-stringifying every
  component and then parsing those strings into another object.
- Generated writer functions and program descriptors are already reusable.
  The existing root execution cache stores component metadata, not an executable
  composition of the root. See the [root program audit](root-program-audit-2026-09-10.md).

These are poor targets for a second cache. State values, selected branches, task
status, ownership, cancellation, and captured resumptions remain request-local.

## The actual string publication chain

The comparison participant's `server-entry.tsx` calls
`renderToHydratableString()` and reads `htmlWithHydration`. It does not call the
request-to-response convenience API in `render/entrypoints.ts`. Optimizing that
convenience API would miss this benchmark.

The exercised source chain is:

1. `render/render-output.ts` prepares root publication, creates the resumption
   capture, and invokes the owned shared tree renderer.
2. `render/tree-output.ts` creates the request context and string sink. At tree
   completion it finishes the sink and constructs a plain result with HTML,
   state, and captured metadata.
3. The owned render releases its owner before returning that result to hydration
   publication. Changing this order requires lifecycle review, even if the
   benchmark's components do not demonstrate a difference.
4. `render/hydration-options.ts` projects publication options into a new object.
   `hydration.ts` constructs the protocol envelope, validates/projects supported
   values, serializes and escapes JSON, and enforces the hydration byte limit.
5. `render/output-result.ts` recognizes normalized document output, searches for
   the last body close, builds augmented chunks, and constructs the hydrated
   result with lazy combined HTML and resumption accessors.
6. The participant reads combined HTML, joining the augmented chunks. The normal
   HTTP adapter subsequently consumes that returned string.

The last three steps contain work beyond the compiler's HTML writer. A cached
writer alone does not remove them. The sink's existing string accumulation uses
`+=`; the normal small-document finish does not perform an exact UTF-8 scan when
the conservative upper bound already proves the output is within its limit.

## Why the obvious publication replacements are not new proposals

| Proposed saving                                   | Existing evidence                                                                                                                                                                                                                                | Remaining issue                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Preserve the compiler-known closing-body position | [Preserved tail](document-tail-parts-2026-09-10.md) removed string recognition/slicing but added fields, per-write bookkeeping, and another chunk. Node HTTP did not improve reliably.                                                           | A new design must avoid that replacement overhead, not repeat the same boundary marker.                                    |
| Reuse the plain result for hydrated output        | [Result consumption](consume-result-http-2026-09-10.md) did not pass HTTP acceptance. [Follow-up telemetry](consume-result-telemetry-2026-09-10.md) reduced the apparent regression to a mixed 1.3%, so the original 18% is not a stable effect. | Fewer result objects did not establish a throughput gain. Changing object construction alone is not a justified next step. |
| Build positional arrays by appending              | [Packed publication](packed-publication-2026-09-10.md) improved the Node screen but regressed the large Bun screen.                                                                                                                              | This did not remove projection or serialization, and the screen consumed `Response.text()`, unlike normal Node HTTP.       |
| Reduce anonymous callback compilation             | [Callback retention](callback-lifetime-diagnostic-2026-09-10.md) sharply reduced compilation completions without improving observed render time.                                                                                                 | Retaining request closures is not a production cache strategy or evidence of a speedup.                                    |
| Cache or fuse the shell's few extra programs      | [Dynamic shell fusion](root-program-audit-2026-09-10.md) removed three invocations/writers with a mixed 0.25% Node string result.                                                                                                                | It leaves component preparation, application traversal, and publication intact.                                            |

## Cost model for choosing the next change

The current HTTP profile attributes 10.47% of eXact active samples to hydration
and 6.13% to result assembly. Even the unrealistic removal of both groups would
give approximately `1 / (1 - 0.166) - 1 = 19.9%` more throughput in a model where
those sample shares equal serial request CPU and all other costs remain fixed.
That is not a measured ceiling: the sample profile is below saturation, inlining
affects attribution, and elapsed time, background compilation, and GC do not obey
that simple model. It nevertheless warns against promising the roughly 34% Node
string improvement needed in the latest throughput capture from publication alone.

Program execution/traversal accounts for another 15.65%, and component preparation
and ownership 8.19%. Their sum, 23.84%, includes required rendering and lifecycle
work. It is not all dispatch overhead. A hypothesis that removes one quarter of
that combined group predicts about 6.3% throughput improvement under the same
simplified model. A small wrapper change cannot reasonably inherit that estimate.

## Decision

Do not resume the three-fragment prototype as the next performance candidate.
It removes only a few invocation/publication boundaries and does not establish
that it removes a substantial fraction of these groups.

The next architectural design should enumerate a complete component execution
boundary: receipt creation, props preparation, program invocation, child target,
writer output, resumption capture, and disposal. For every stage, distinguish
compiler-static decisions from request-owned work. A direct compiler-issued call
is useful only if it eliminates intermediate construction and redispatch while
preserving that boundary's semantics. Moving the same work into a cached function
does not count as elimination.

In parallel conceptually, document publication needs a single completion plan
that specifies which outputs the caller consumes, where hydration is inserted,
and when ownership ends. It must preserve the existing public result contract
where requested. Merely mutating the current result or storing its tail has
already been tried. No implementation benefit is claimed for this design yet.

The required proof before timing either design is an explicit before/after work
inventory for the real dynamic-asset document. It must account for conditional
and keyed children, prepared siblings, actual task suspension, enhancement
capture, output extensions, resource limits, and cleanup. Compiler-owned static
plans may be shared; request state and lifecycle owners may not. String and stream
sinks continue to use one execution engine, including the retained ready-write
behavior and early head publication.

This audit narrows the next action to component-boundary design and caller-specific
publication planning. It does not establish a new performance result, justify
removing validation, or show that the React comparison goal is complete.
