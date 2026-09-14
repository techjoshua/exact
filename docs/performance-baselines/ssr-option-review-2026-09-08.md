# SSR optimization option review, September 8, 2026

This is a source and existing-profile review, not a new benchmark. It revisits three proposed
directions after the unsuccessful hydration serialization experiments. No runtime changes are made.

## Response construction: a narrow experiment is warranted

`createExactProducedResponse` appears as a self-time site in both archived eXact profiles:
2.321 and 1.914 sampled microseconds per request. Its current implementation allocates one
`ProducedResponseBody`, one response object, and installs three own properties with
`Object.defineProperty`. The body and stream getters and their descriptors are already shared;
there are no per-response getter closures to eliminate.

The benchmark uses this factory directly. Its normal path claims the synchronous producer,
collects strings, and calls `response.end`. It does not create a Web stream. It does not retain a
server request scope through `createExactNodeHandler`; suggesting removal of those costs would
target work absent from the measured path. The ownership object still provides single consumption.

A small experiment comparing property installation strategies is justified by the repeated self-time
site. It must retain the response's own enumerable lazy body and stream properties and the ownership
contract. Moving the getters to a prototype would change that observable contract. Combining property
definitions may itself cost more, so no saving or allocation reduction is established yet. The whole
3.37-microsecond ownership/adapter bucket is not an estimate of recoverable construction cost.

## HTTP input and output: diagnostic controls are warranted

Both participants use the same Node host, request-entry callback, URL parsing, preloaded-data branch,
and response instrumentation. eXact's general `createExactNodeHandler`, `readNodeRequestBody`, and
`handleExactRequest` are not on this benchmark path. There is no evidence here supporting an eXact
request-parser or routing optimization.

The original classifier uses ancestor modules and precedence rules. Its input/dispatch bucket
includes shared benchmark callbacks, URL handling, and some response lifecycle work. The output
bucket matches broad socket/stream modules. These categories are useful stack groupings, not clean
input/output phase measurements.

Inspecting the native `parse` self samples identifies three callers shared by both frameworks:
the host's control-route URL, `equalizeNodeResponsePayload`, and the participant handler's URL.
Their combined sampled times are 3.457/3.382 for eXact and 3.111/2.421 for React in the two populations.
The differing measurements do not establish different application code or different parsing counts.
Context-dependent execution and host/sampling variation remain unresolved explanations.

There is a concrete response-side difference: eXact uses `setHeader` followed by `end`, whereas
React uses `writeHead` followed by `end`. The archived captures verify Content-Length versus chunked
transfer, and native output sites differ. Header-order, Buffer encoding, and string-joining
experiments already failed to establish an eXact gain, so repeating those as optimization proposals
is not justified.

An identical prebuilt response can be a diagnostic control, but identical body bytes alone do not
isolate the cause. A useful design would separately control headers/framing, string representation,
producer construction/consumption, connection settings, and telemetry. Start with a repeated identical
handler under both participant labels to measure the noise floor. Then vary one response mechanism.
Do not infer that the entire measured input difference is caused by response handling, or infer
rendering cost by subtracting prebuilt-response timings from whole-request timings.

## Smaller hydration payload: no substantial target identified

The archived payload contains initial data once in positional root props. Its only separate
resumption entries are `[[3,false],[4,"inc-101"]]`, corresponding to `loading` and `selectedId`.
Those entries occupy 25 JSON bytes. Including the component identity and containers, the complete
resumption list occupies 55 bytes. Incidents, users, and session identity are not duplicated there.

The emitted contract identifies those three large state values as prop inputs. Capture skips them
when they match published root props; it also skips the declared `connection` and `error` defaults.
The two remaining scalars are derived by expressions rather than declared literal defaults. Proving
that the client can reconstruct them with identical semantics requires more than observing that
this fixture's values look predictable. Their presence does not establish a worthwhile compiler
optimization. The payload's existing compactness does not rule out opportunities in other apps,
but no larger redundant value was identified here.

## Decision

Prioritize a narrowly scoped response-factory experiment. A controlled transport diagnostic is
reasonable after establishing an identical-handler baseline and correcting phase attribution.
Do not start a hydration data-elimination project or eXact input-handler refactor from the current
evidence. These decisions establish where experimentation is warranted, not that a performance
improvement has been found.

Sources: [paired profiles and archived evidence](ssr-paired-profile-2026-09-08.md),
[hydration serialization experiments](ssr-hydration-fusion-2026-09-08.md),
[response factory](../../packages/server/src/response-body.ts),
[Node writer](../../framework-adapters/node-adapter/src/handler.ts),
[benchmark host](../../framework-comparison/src/ssr-benchmark-host.mjs),
[resumption capture](../../packages/ssr/src/resumption-serialization.ts), and
[participant state definitions](../../framework-comparison/participants/exact/src/IncidentApp.tsx).
