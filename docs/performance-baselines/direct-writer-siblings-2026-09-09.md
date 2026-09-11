# Direct writer sibling preparation prototype

Date: 2026-09-09. Experimental bundle only; production unchanged.

The continuation-based direct writer previously rejected scheduled component references at its
operation target. This experiment starts replacing that limitation with an explicit preparation
phase. Four generated programs with five known direct-component sites create their references
after slot validation and before ordered writes. Their direct-component operations then use those
same references. The operation target supplies the existing sibling preparation function, and the
writer retains its returned scope through synchronous or asynchronous completion and failure.

The hypothesis is architectural: moving known sibling preparation ahead of traversal should allow
tasks to start together while output remains ordered, without constructing a segment array. No
throughput gain is predicted or claimed for this correctness experiment. The prototype still
allocates a cleanup wrapper even when preparation is absent; optimize that only after integration.

Eight focused checks cover Node/Bun, immediate/pending first-child completion, and success/failure
of the second child. They use the actual experimental writer and serialization operations, with
synthetic preparation/render callbacks. Both preparation events occur before first-child rendering;
the second render waits behind the first; disposal occurs exactly once; the original failure is
preserved; and document host depth returns to zero. These checks verify the new scope mechanics,
not real task construction, generation fencing, cancellation, or disposal of unused task frames.

Sixteen full-document smoke observations compare the prior direct-writer prototype with this
candidate across both runtimes, both output modes, and small/large fixtures with four assets.
All eight paired document hashes match. The worker performs one warmup and one measured render;
those diagnostic timings are ignored. These fixtures do not contain pending scheduled siblings.

## Remaining integration

The next check must use actual compiler-generated scheduled sibling components and the real task
preparation/disposal machinery. General component slots are not yet included in the generated
preparation list. The direct component-content route relies on its existing issuer ownership and
does not receive the operation target's preparation callback. Enhancement capture, complete
boundary handling, cancellation, and early shell flush remain unfinished. The old prototype still
accumulates its whole document before the outer transport publishes it.

This candidate derives from the older `direct-writer-current-node` experimental artifact, not the
current retained production bundle. It is a correctness prototype and cannot replace current code
without rebasing the retained improvements and completing integration. No application, package,
browser, or production compiler source changed in this experiment. No new React comparison is
claimed, and the overall goal remains incomplete.

The adjacent archive contains the baseline/candidate, builder, audits, smoke worker and fixed input,
raw results, and a verified SHA-256 manifest.
