# eXact component composition corpus

This private package is the normative acceptance corpus for native eXact components. It exercises
authored component semantics, compiler specializations, supported general paths, and rejected
legacy paths across client rendering, updates, disposal, server rendering, streaming, and
hydration.

The current inventory covers 42 compiler paths across 10 scenarios and 40 normative tests,
including shared setup/interaction invocation of one durable function-task definition and
receiver-owned indexed input updates across client replacement and hydration.

The expectations are handwritten framework contracts. They are deliberately not snapshots of the
compiler's current output. Add a scenario whenever the compiler gains a specialization or a
supported fallback, and add its path to the inventory first so the coverage gate cannot be bypassed.

Run the complete corpus with `npm test -w @exactjs/component-composition-corpus`. Use `test:fast`
for the manifest and generated-structure gates while changing compiler lowering.
