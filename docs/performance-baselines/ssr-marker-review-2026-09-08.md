# SSR marker necessity review, September 8, 2026

This audit traces the comparison document's markers through current compiler emission and DOM
consumers. It does not change marker contracts or claim a throughput improvement.

This is the pre-change inventory. The subsequent
[text-run implementation and measurements](ssr-text-runs-2026-09-08.md) tested removing scalar comments
by splitting text during adoption while retaining independent bindings. The
[forced-rebuild follow-up](ssr-fresh-build-2026-09-08.md) verifies both marker strategies using the
same optimized scalar writer and retains markerless adoption without claiming an HTTP gain.

## Adjacent text clarification

The existing joining optimization folds static text around **one** scalar expression into its
focused operation. It does not join several reactive expressions into one text binding.
`renderProgramTextProjections` explicitly excludes a candidate adjacent to another expression.
The compiler's `TestSessionPlansScalarChildrenBesideStaticText` verifies two separate operations
for `<small>{props.owner} · {props.status}</small>`.

For an isolated scalar, including its folded static prefix/suffix, `markerlessTextSlot` already
omits SSR comments when surrounding markup proves its boundary. DOM claims then retain or create
the one text node. There is no identified leftover marker pair in this already-joined case.

The comparison rows instead contain two expressions separated by static punctuation. They still
emit two marker pairs per row. Removing those comments without changing the client representation
would let HTML parsing merge the text that the client expects to claim independently.
`claimCompiledProgramText` and `claimProgramTextSlot` remove both comments after successfully
claiming each scalar. Subsequent text updates retain the Text node, not the comments.

## Measured inventory

Rendering the current built Node participant with the archived initial data reproduces the prior
inventory: 286 comment bytes and 160 identity-attribute bytes. The participant's HTML plus hydration
script is 3,397 bytes; the benchmark's 214-byte document envelope produces the reported 3,611 bytes.

| Marker purpose                                          |        Count | Bytes | Current necessity                                                                                                                            |
| ------------------------------------------------------- | -----------: | ----: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Two independent scalar expressions in each incident row |      6 pairs |   126 | Prevent text merging and identify independent claims; removed after successful hydration                                                     |
| Queue component slot before the detail component        |       1 pair |    21 | Bounds variable-width component output before another component                                                                              |
| Queue loading, empty, and error slots                   |      3 pairs |    63 | Preserve independent insertion positions, including when all are empty                                                                       |
| Detail conflict and error slots                         |      2 pairs |    34 | Preserve dynamic ranges in the generic lane                                                                                                  |
| Empty-comment message and comment list before the form  |      2 pairs |    42 | Bound variable-width children before a persistent sibling                                                                                    |
| Generated element identity attributes                   | 4 attributes |   160 | Consumed by server patch identity and deferred interaction/recovery mechanisms; not required for ordinary compiled element-path claims alone |

The queue list already avoids per-item comment pairs in this fixture. Compiler-known final child
slots already use their parent end; bounded native component slots can also omit delimiters where
the following intrinsic is addressable from a stable edge. Broadly removing component/list markers
would repeat optimizations that are partly implemented and break the remaining unproven cases.

Structural comments are not scalar hydration leftovers. `prepareProgramChildBinding` retains the
closing boundary as the insertion position for later patching. An empty initial range is not evidence
that its endpoints are unnecessary.

## Is experimentation warranted?

**Extend scalar joining: yes, as a narrow compiler experiment.** A compiler-proven all-text run
could potentially use one markerless Text node. For the three comparison rows this would eliminate
126 bytes and twelve initially parsed Comment nodes, about 3.5% of the complete document. It would
also avoid removing those comments during hydration. This is an extension of the current joining
optimization, not merely deleting obsolete output. It must preserve evaluation order, null/boolean
text semantics, whitespace, escaping, and update correctness. Recomputing both expressions on either
change could increase work; retaining independently computed pieces adds its own bookkeeping.
Measure both SSR and client updates, including large repeated rows, before adopting either design.

**Remove the four identity attributes globally: no.** Compiled element claims use structural paths,
but `data-exact-id` also participates in server diff targets, patch indexing, deferred event policy
and replay, and form-state recovery. The fixture's eager native path does not establish that a
reusable artifact will never need those consumers. A separate compiler proof for restricted emission
would be needed before a deletion experiment. No such unused-identity proof was established here.

**Remove structural ranges: no broad experiment justified.** The remaining ranges have concrete
consumers and no duplicate endpoints were identified. Extending bounded-component proofs is a
different compiler feature with a small 21-byte opportunity in this particular document.

Any changed emission/claim representation needs ABI classification and old-artifact compatibility
review. The byte opportunity is established; a speedup is not. The response-construction experiment
remains separately queued.

Source references:

- [Text projection](../../native/typescript-go/overlay/internal/exactcompiler/jsx_render_program_text_projection.go)
- [Markerless scalar proof](../../native/typescript-go/overlay/internal/exactcompiler/jsx_render_program_build.go)
- [SSR emission](../../packages/ssr/src/render/render-program.ts)
- [Direct DOM claims](../../packages/dom/src/renderer/render-program-claims.ts)
- [Generic scalar claims](../../packages/dom/src/renderer/render-program-hydration.ts)
- [Structural child ownership](../../packages/dom/src/renderer/render-program-children.ts)
- [Element-path claims](../../packages/dom/src/renderer/render-program-claim-path.ts)
- [Patch indexing](../../packages/hydrate/src/patching/indexing.ts)
- [Deferred event authorization](../../packages/hydrate/src/islands/policies.ts)
- [Form recovery identity](../../packages/hydrate/src/adoption/form-state.ts)
