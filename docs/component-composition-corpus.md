# Component composition corpus

The component composition corpus is the normative acceptance suite for native eXact compilation.
It lives in `packages/component-composition-corpus` and protects semantics that otherwise tend to
surface as isolated application regressions after compiler changes.

The current inventory covers 48 compiler paths across 10 scenarios and 45 normative tests,
including shared setup/interaction invocation of one durable function-task definition and
receiver-owned indexed input updates across client replacement and hydration. Compiler-created
intrinsic identity is also protected as immutable server data outside the request-local dynamic
attribute plan, and compiler-known root openings publish through one focused server operation.
Exact synchronous server value propagation also emits direct assignments while authored
calculations retain their executable setup boundary.
Exact prop snapshots expressed through `peek()` also remain compiler-known resumption inputs: the
server verifies equality before omitting redundant nested state, while those server-only source
paths do not ship in hydration artifacts.
Compiler-closed single-scalar text runs also retain adjacent authored text in one focused operation,
while multi-expression runs keep their independent reactive owners.
Compiler-proven native `maxLength` literals and bare `required` attributes are protected as static
client, server, and hydration structure; dynamic values and custom-element properties retain their
runtime operations.

## Contract model

The corpus has two independent layers:

1. Handwritten behavior expectations define what authored TSX must do during client mount, indexed
   updates, final disposal, synchronous and asynchronous SSR, streaming, progressive output,
   matching hydration, and compiler-owned root recovery after a structural mismatch.
2. Generated-structure predicates verify compiler-owned properties such as target-local artifact
   emission, attachment ordering, enhancement dependencies, and exclusion of native VNode or
   runtime-artifact fallback paths.

Expected HTML, DOM identity, state transitions, cleanup counts, and recovery boundaries are authored
framework contracts. Tests must not derive expected values from current compiler output or replace
these assertions with whole-output snapshots.

Enhancement hydration uses the framework's server pass-through projection and activates the
bundle-local implementation after adopting the authored target. SSR behavior is tested separately
with the server implementation present, including target contributions across native component
boundaries.

## Inventory discipline

`src/compiler-path-inventory.ts` is the complete ledger of known specialized paths, supported
general paths, explicit compatibility boundaries, diagnostics, and forbidden legacy paths.
`src/scenarios.ts` assigns each path to at least one scenario and declares the rendering modes in
which it must be exercised. The inventory tests fail for unknown paths, missing paths, duplicate
inventory identities, or missing required rendering modes.

When compiler behavior changes:

1. Add or update the inventory entry and its required modes.
2. Add the smallest independently meaningful component scenario that exercises the behavior.
3. State the normative observation before running the fixture.
4. Compose the scenario with related capabilities when the interaction creates additional risk.
5. Run `npm test -w @exactjs/component-composition-corpus`.

Compatibility components remain owned by their explicit renderer. They may be represented in the
inventory as a boundary, but they must never be used to justify a VNode or runtime-created artifact
path for native eXact components.
