# eXact component composition corpus

This private package is the normative acceptance corpus for native eXact components. It exercises
authored component semantics, compiler specializations, supported general paths, and rejected
legacy paths across client rendering, updates, disposal, server rendering, streaming, and
hydration.

The current inventory covers 58 compiler paths across 11 scenarios and 58 normative tests,
including shared setup/interaction invocation of one durable function-task definition and
receiver-owned indexed input updates across client replacement and hydration.
It also covers compact direct-property operands forwarded from keyed rows and object-valued indexed
props to native children, including replacement and hydration.
It also verifies matching target-local schemas for compact positional publication of finite nested
root props.
It also protects compiler-proven static native numeric and boolean attributes across client, server,
and hydration targets while retaining dynamic and custom-element fallbacks.
It also protects marker-free opaque native child ranges bounded by a following compiler-known
intrinsic, plus the explicit-marker fallback when the parent is too deeply nested for the focused
claim proof, across client updates, server output, and matching hydration.

The expectations are handwritten framework contracts. They are deliberately not snapshots of the
compiler's current output. Add a scenario whenever the compiler gains a specialization or a
supported fallback, and add its path to the inventory first so the coverage gate cannot be bypassed.

Run the complete corpus with `npm test -w @exactjs/component-composition-corpus`. Use `test:fast`
for the manifest and generated-structure gates while changing compiler lowering.
