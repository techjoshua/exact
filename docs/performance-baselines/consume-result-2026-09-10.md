# Consuming the renderer result, September 10, 2026

Status: promising isolated prototype. Not yet integrated or HTTP-validated.

## Change and ownership hypothesis

Hydratable rendering currently receives a private completed renderer result,
then constructs another object and copies its HTML, state and metadata. The
prototype augments the existing result with hydration publication and shared
lazy accessors. It removes the second result object and metadata copies while
retaining the shared renderer and request-local lazy storage.

The expected benefit is a modest portion of the measured 3-4 microsecond result
assembly stage. This differs from earlier descriptor-map or Object.create
experiments: it removes a wrapper rather than reconstructing it differently.

This changes the internal helper's ownership contract. Its input is consumed
once and must not be reused to construct another independent hydrated result.
Public key enumeration order also changes: ordinary HTML/state/metadata keys
precede newly added hydration keys. Shared own getters, field names, prototype,
and hidden chunk properties retain their representation. A future source
integration must explicitly document ownership and update relevant tests rather
than silently treating the helper as a non-mutating factory. The current helper
tests deliberately reuse their input and are not claimed to pass this prototype.

The hydrationScript property is defined as an own writable/configurable data
property, avoiding inherited setter interception. No request-created accessor
closures or WeakMap storage are introduced.

## Focused evidence

Eight fresh production processes measure the three-incident full application
document with four asset tags. Node 26.8.1 and Bun 1.4.2 each run both orders,
50,000 warmups and 20,000 measured complete encoded string renders. Workers
execute sequentially at below-normal priority while the PC is in use. Both
runtimes use the portable Node entry, not native Bun HTTP transport.

Mean microseconds per complete encoded render:

| Runtime | Current | Consume result |
| --- | ---: | ---: |
| v26.8.1 | 44.39 | 40.48 |
| 1.4.2 | 36.10 | 35.59 |

Both pair directions favor the candidate on both runtimes, but Bun's second pair
is nearly tied. Shared-PC drift prevents interpreting these means as precise
causal improvements. All final response hashes match. No new React comparison
or HTTP capacity claim is made.

Four separate Node allocation captures use 16 KiB inspector sampling, including
minor-collected and major-collected objects, after 50,000 warmups over 10,000
measured renders. Mean sampled allocated bytes per render are
67,809 current and 67,009 candidate, approximately
1.2% lower. Both allocation pair directions favor the candidate.
These are sampled estimates; GC collection counts and duration were not measured.

Twenty-four independent full-output comparisons pass across Node/Bun,
small/large documents, string/stream modes, three concurrent requests with
distinct titles, and forced suspension every third otherwise-ready checkpoint.
This covers fixture output and continuation behavior, not the complete ownership
contract or package/browser integration.

## Next acceptance work

The prototype warrants a source-level ownership review and explicit lifecycle,
metadata and lazy-read tests. If integrated, rebuild both runtime artifacts and
run focused paired HTTP comparisons, including streaming, before claiming a
retained cross-runtime performance improvement. Existing released fixtures must
remain unchanged. No production source or canonical artifact changed here.

The adjacent evidence archive contains the builder, timing/allocation workers,
all raw results and profiles, forced-suspension checks, fixed fixture,
control/candidate artifacts, and a SHA-256 manifest. The control artifact is
`2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
The overall performance objective remains unmet.

Follow-up: [HTTP acceptance](consume-result-http-2026-09-10.md) rejected this candidate for a consistent Node string regression. The previous implementation and canonical artifacts are restored.
