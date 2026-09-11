# Structured compiler effect paths

Date: 2026-09-09. Compiler analysis foundation for selective SSR waiting.

Task and callable effects now retain internal property segments alongside their existing display
labels. Collection copies the segments, propagation retains them, deduplication keys them without
dot ambiguity, and fixed-point signatures detect changes to structured identity. Ancestor-based
read minimization compares segments and cannot infer ancestry from a label lacking provenance.

This addresses the collision characterized in the task-path-identity report: writes to the literal
property `state["page.title"]` and the nested property `state.page.title` no longer collapse into one
internal task effect. The internal field is not serialized into compiler analysis JSON. Consumers
of display labels still cannot use those labels to reconstruct precise property identity.

The native compiler and command tests pass, including a focused regression covering deduplication,
fixed-point identity, parent coverage, uncertain provenance, and propagation. Source architecture
and the initial release ABI check pass. Engineering SSR documentation describes the new internal
representation and its limits. No public API or compiler-emitted helper signature was added.

This is incomplete groundwork. Literal star keys and unknown computed segments still share the
existing representation and confidence rules. Effect completeness and escaping state require their
own proof. The current renderer still waits at component scope, and no throughput improvement or
early shell output is claimed. Further compiler-emission integration will require additional runtime
validation.

## Rebuilt runtime validation

Core and SSR fixtures were recompiled with the new native compiler. A new compiled SSR fixture
suspends in a blocking server task, then calls a helper that writes both the literal dotted property
and the nested property. Its rendered strong and small elements contain the distinct settled values.
All 289 SSR tests and 258 core tests pass, along with test type checking, changed-file lint, frozen
compiled ABI fixtures, and package-content checks.

The comparison client, Node server, and Bun server were rebuilt. The Node server is byte-for-byte
identical to the retained unowned-program artifact, SHA-256
`fe5c90d02d7b6e9a2c26a0e7fce5be8c0347ebfc6f2fa9650ffccf16d3eb591a`.
The client remains `index-CdIXDKwS.js`. No new browser or timing run is claimed. Existing comparison
measurements still describe the same Node-target artifact; this work adds correctness evidence,
not a performance result.

The accompanying structured-effects audit and results preserve the before/after compiler case.
The original task-path-identity audit remains unchanged as historical evidence.
