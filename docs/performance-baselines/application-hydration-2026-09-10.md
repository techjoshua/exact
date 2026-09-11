# Application-owned hydration diagnostic, September 10, 2026

Status: prototype, not integrated. The canonical application source and server
bundles were restored and their original hashes verified after browser testing.

## Hypothesis

The static-shell diagnostic changed both document rendering and hydration
ownership. This experiment keeps the normal Document rendering and all its asset
mapping, programs, markers, and framing. Only hydration publication changes from
Document props to IncidentApp props, with the browser adopting IncidentApp in
`#app`. This tests the user's distinction between a requested application root
and an enclosing server document shell.

The generated-bundle prototype substitutes an application publication reference
in the root publication helpers. It retains the existing renderer, validation,
JSON serialization, application state capture, and adapters. Its three helper
calls synthesize short-lived reference/prop objects; a final framework design
should select the publication root once. There is no application HTML or state
cache. This is not a proposed application-specific runtime branch.

Six changing-request checks across string and streaming verify that removing the
hydration script leaves byte-identical documents. Hydration JSON drops by 250
bytes, from 745 to 495 bytes with the standard fixture. Complete responses are
4,422 bytes instead of 4,672. The changed request titles remain in fresh JSON.

## Browser contract discovery

The first prototype passed all 14 Node string checks, but Node streaming failed
the zero-root-replacement assertion. Thirteen other checks passed in that cell,
including interactions after the fallback render. Testing interaction success
alone would have missed the failed adoption.

String publication already declared a markerless root. Streaming still described
the outer Document's root semantics, while the newly selected IncidentApp had a
compiler-emitted markerless component position. The corrected prototype carries
that markerless-root fact with the application publication. The browser entry
reads IncidentApp's published props and hydrates it in `#app`.

The corrected build passes all 56 existing browser checks: 14 each for Node and
Bun, string and streaming. They include meaningful HTML without JavaScript,
adoption without replacing the root, optimistic claims and recovery, comments,
server analysis progress, focus preservation during another session's updates,
validation and transport failures, keyboard selection, and reconnection. React
is included as the unchanged control in every cell. Browser builds use their
actual generated asset URLs, not the fixed HTTP fixture URLs.

Initial failed logs and artifacts are preserved separately from the corrected
results. Build and browser ownership scopes restored the normal sources and
artifacts even after the initial failure.

## HTTP throughput

Independent production servers use Node 26.8.1 and Bun 1.4.2 with their normal
adapters. Each gets a ten-second warmup. Four rotated orders use 1.5-second blocks,
two drivers at concurrency 16 each, and below-normal process priority. Every
response must match its complete expected byte count and SHA-256. Candidate and
control documents outside the hydration script are also compared before timing.
No builds, browser tests, or profilers run during the HTTP capture. The PC remains
in active use; read-only source inspection also occurs during the run.

| Runtime / mode | Normal eXact | Application-only publication | React | Candidate change |
| --- | ---: | ---: | ---: | ---: |
| Node string | 7,147 | 7,139 | 11,175 | -0.1% |
| Node stream | 5,670 | 5,867 | 4,475 | +3.5% |
| Bun string | 9,885 | 10,262 | 10,564 | +3.8% |
| Bun stream | 7,692 | 7,688 | 8,100 | -0.1% |

There are 575,600 valid measured responses and zero errors. The candidate improves
in two of four Node string blocks, three Node stream blocks, all four Bun string
blocks, and one Bun stream block. Small mixed differences are not stable wins.
This change does not explain most of the earlier raw-shell throughput difference.

## Architectural consequence

Document ownership and hydration ownership can be separate in this workload,
with real browser adoption. Root identity, root props/schema, resumption input,
markerless-root metadata, and the browser container must move together.
Removing clientTags from JSON without those coordinated changes is insufficient.

A reusable design must also handle shell-owned tasks, contexts, sibling state,
cancellation, and an explicitly reactive authored document. This experiment has
a stateless shell and does not prove those broader contracts. It does not justify
silently changing existing authored Document hydration into child hydration.
The framework needs an explicit distinction between an enclosing server shell
and the requested hydration root, with compiler-owned boundary facts.

Raw evidence and executable diagnostic scripts are preserved in
[the follow-up archive](document-publication-followup-2026-09-10-evidence.zip).
