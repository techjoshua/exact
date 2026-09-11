# Component markers in staged publication

Date: 2026-09-09. Correctness integration prototype, production unchanged.

The staged sink experiments previously disabled markers. Enabling them exposed the explicit
unsupported-component-boundary guard. This audit compares the same compiler-generated source
through the current production engine and the experimental staged engine, including exact
component marker identities and resumption records.

The control fixture is transpiled directly from the native compiler response, without rewriting
its SSR programs. Its runtime is the current built comparison entry, augmented with internal test
exports and the same module-local component issuer. The candidate uses the transformed fixture,
the prior cancellation fix, and the native string sink. Both render their own document shell.

## Integration changes

The prototype scopes a temporary string capture around child component rendering when markers
are enabled. The existing boundary publisher receives that captured HTML, applies the existing
marker identity and wrapping logic, and returns it to the parent sink. Scope cleanup restores
the parent sink on both success and failure. The root document retains direct publication.

An initial capture experiment silently omitted child HTML because ChildrenOutput still assigned
to the former accumulator's value property. That path now forwards returned HTML and text
separators through appendSharedSink. Removing the unsupported-boundary guard alone is therefore
insufficient. The final exact-output audit protects against this loss.

## Evidence

On Node 26.8.1 and Bun 1.4.2, candidate and production control match byte-for-byte with markers
disabled and enabled, including both resumption records. This fixture is 553 UTF-8 bytes without
markers and 747 with them. The enabled case contains two component marker pairs with the same
production identities. These sizes describe this two-child test document, not the comparison app.

Twelve additional cases exercise the candidate through the optimized byte sink and pressure
wrapper: both runtimes, 1-, 8-, and 8,192-byte thresholds, successful completion and cancellation.
They enforce one outstanding transport write, complete document content, exactly one hydration
serialization on success, and disposal of both children once. Success emits 11, 10, and 4 chunks
respectively. Component capture intentionally changes chunk grouping. Head publication remains
outside the child captures.

## Limits and next integration work

The capture is deliberately conservative and buffers marked child components. It has not been
benchmarked and should not be described as a throughput improvement. Native compiler staging,
minimal boundary capture, arbitrary nested/retry/enhancement cases, uncaptured standalone
resumption wrappers, and browser adoption still need validation. Matching SSR bytes is strong
evidence for this fixture, but it is not a browser hydration test.

Production source is unchanged in this step. The overall performance objective remains unmet.
The evidence archive preserves builders, source compiler response, control/candidate artifacts,
sink implementations, exact output, pressure traces, and a verified SHA-256 manifest. Reproduction
requires built workspace packages and the comparison entry.
