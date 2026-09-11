# Component boundary work inventory

Status: diagnostic trace, no optimization candidate or throughput measurement.
The retained conditional-emission artifact is unchanged. This follows the
[root publication source audit](root-publication-source-audit-2026-09-10.md).

## Capture

A TypeScript AST instrumenter wraps named functions and relevant sink methods in
an isolated copy of the frozen retained Node artifact. Twenty warmup renders
precede one traced render for each of string, stream, and forced-pending head
flush. Node runs below normal priority. Each complete response is compared with
the uninstrumented artifact for its mode. All three match at 4,672 bytes.

This trace uses the portable Node artifact, not native Bun HTTP. It measures
call entries, not allocations, CPU cost, or capacity. No duration from the
instrumented trace is presented as a performance result. Forced pending means
the diagnostic wraps the head flush completion in a promise; it is not a network
backpressure simulation or browser test.

The input artifact SHA-256 is
`8ab1cfb4e475362dc59ab5c325ac29f093bfc6cdfd114e422dca7116832434f6`.
String output SHA-256 is
`0a81e47ed671b35c366ab1c60ed8592f2715c3ad235673e185fc199bf28af411`.
Both stream outputs have SHA-256
`9b9e8470279c43fb0a3a6eecd7b29327336d8d6505f1986fbf9eb1ad7cbffdc1`.
Modes need not have identical markup; instrumented/control parity is checked
within each mode.

## Component attribution

The table attributes entries to the nearest active synchronous
`executeDirectSsrComponent` call, excluding nested component execution. It uses
the ready string trace. Component names are mapped from the artifact's attached
compiler identities. Deferred callbacks in the pressure trace do not necessarily
remain on that synchronous stack, so this attribution is not applied to them.

| Component | Instances | Invocation constructions | Writer executions | Child-group renders | Sink writes | Props preparation calls | Sibling preparation calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Document | 1 | 8 | 8 | 11 | 25 | 1 | 1 |
| IncidentApp | 1 | 1 | 1 | 0 | 5 | 1 | 1 |
| IncidentQueue | 1 | 4 | 4 | 4 | 25 | 1 | 3 |
| IncidentDetail | 1 | 5 | 7 | 6 | 26 | 1 | 1 |
| SeverityBadge | 4 | 4 | 4 | 0 | 8 | 0 | 0 |
| Total | 8 | 22 | 24 | 21 | 89 | 4 | 6 |

All eight component executions select the synchronous classification. Document
and SeverityBadge select stateless mode; the other three select direct mode.
All four badges consume the scalar-props proof. Synchronous component
classification does not guarantee that descendant rendering or transport cannot
suspend. Each component enters the child issuer once, including stateless ones.

The shell and detail view account for 15 of 24 writer executions. That identifies
where structural composition would apply, not 62.5% removable CPU. HTML writes,
expression evaluation, list iteration, validation, and component lifecycle remain.
The earlier three-program shell fusion removed only part of this structure and
did not demonstrate a substantial HTTP gain.

## Source ownership inventory

`component.ts` creates the publication record and forwarding callbacks.
`server-component-abi-execution.ts` selects the contract, prepares construction
props, and creates a request-owned execution target. `synchronous-artifact.ts`
bridges that target to `executeDirectSsrComponent` and publishes component output.

`direct-component.ts` prepares unresolved props when necessary, chooses the
component frame and owner, invokes the compiler render function inside its domain,
and handles observation, resumption reservation/publication, rollback, and cleanup.
Its existing stateless branch already skips unnecessary lifetime bookkeeping.

`direct-component-scheduling.ts` installs an issuer while component output is
constructed. This starts scheduled child work before serial traversal. Separately,
generated program writers prepare references created during writer execution.
Those references appear after the outer issuer has returned. Both paths are
necessary for their respective creation times; calling both is not itself proof
that the same scheduled task starts twice.

`direct-component-content.ts` classifies issued content, and `render-program.ts`
executes the selected writer. `program-writer-output.ts` gives each invocation its
output/preparation lifetime, host ancestry, head flush, and completion check.
These operations cannot all be replaced with a bare `child.render(sink)` call
without carrying their ownership and ordering semantics elsewhere.

## What this changes about the next design

Focus the proposed composition on structural programs within a component first,
while retaining one component execution boundary. The strongest concentration is
Document plus IncidentDetail. The generated implementation should execute their
structural children directly where compiler proof permits, without first building
and then redispatching invocation/child-group representations for those positions.

That proposal differs from changing invocation object layout, removing the content
wrapper, or caching already-hoisted writer functions. It also differs from eagerly
rendering child components as their references are constructed. Eager rendering
would change sibling task start order, error timing, and output commitment.

Before implementation, inventory which of these structural positions can retain
their preparation prefix while eliminating intermediate dispatch. In particular,
dynamic lists need iteration and key semantics, document hosts need ancestry and
early head publication, and prepared sibling frames need one cleanup owner across
suspension. The paused three-fragment prototype is evidence of only a partial
rewrite and is not accepted as that broader design.

No new percentage saving is inferred from call counts. The previous cost model
remains conditional on eliminating measured work, and actual HTTP validation is
still required. The React performance objective remains unmet.

## Evidence

The adjacent evidence ZIP preserves the instrumenter generator, instrumenter,
analyzer, frozen input, input data, instrumented artifact, site list, all three
traces and summaries, per-component counts, this report, and a SHA-256 manifest.
The archive is checked for entry integrity after creation. No package or browser
validation is claimed for this source-free diagnostic.
