# Instance-bound writer investigation, September 10, 2026

Status: compiler/runtime audit and bounded bundle experiments complete. No instance-bound writer change is adopted. Production source remains the individual-descriptor result-storage candidate documented in result-construction-2026-09-10.md. The overall performance objective remains unmet.

## Existing representation

Component preparation already invokes server.render.call(frame, props). The compiled HTML writer later receives operations, context, a prepared invocation and its output explicitly. Prepared invocations contain a program descriptor and eagerly captured values; they also participate in compiler proofs and generated continuation storage. The writer is shared code, not a newly generated function per component call.

Instrumentation associates prepared invocations with their actual component preparation scope, including returned render functions, and counts writes. Full output matches the uninstrumented current application in both string and streaming modes.

| Fixture | Component calls | Frame objects observed | Calls using the shared stateless frame | Fresh program invocations | Program writes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3 incidents | 8 | 4 | 5 | 22 | 24 |
| 96 incidents | 101 | 4 | 98 | 208 | 210 |

Both modes have the same counts. The four observed frames comprise three stateful frames plus the shared stateless frame. Two program writes use invocations outside the measured preparation scopes, corresponding to hoisted invocations in this fixture. Logical components are not equivalent to allocated frame objects.

Document creates eight fresh program invocations, IncidentApp one, IncidentDetail five, and IncidentQueue four or 97 depending on fixture size. The large queue constructs one root invocation plus one per row. Therefore a single mutable current-fragment field on the component instance cannot simply replace every invocation: multiple fragment inputs coexist before traversal. A compiler redesign could avoid some of that packaging, but it must preserve evaluation and task-preparation order or explicitly redesign the relevant contract.

## Bounded root experiments

The initial hypothesis was a small improvement from removing the three stateful root invocation objects without changing nested fragments or stateless execution. All variants are asserted transformations of the current compiled fixture, not compiler or production-source implementations:

- Control: unchanged individual-descriptor result-storage build.
- Call-only: the writer is invoked with .call(invocation, ...) while retaining its explicit arguments. This isolates call dispatch and does not claim to bind every writer to a component instance.
- Root storage: IncidentApp, IncidentQueue and IncidentDetail return their existing stateful frame with program/brand/eager-values fields instead of allocating a separate root invocation. Other invocations remain unchanged.
- Preallocated root storage: those render fields are included when constructing the direct frame, testing whether adding fields later was the problem.
- Receiver-reading writer: the three root writers actually read their invocation from this. Their generated suspension continuations restore that receiver with .call(savedInstance, ...). An unused positional argument remains solely to isolate this bundle experiment from a full ABI migration.

Each screen uses fresh production processes, the three-incident document with four asset tags, 50,000 warmups, 20,000 measured renders and two reversed variant orders. Complete-document hashes match. Mean microseconds/render:

| Screen | Runtime | Control | Call-only | Root storage | Preallocated / receiver-reading |
| --- | --- | ---: | ---: | ---: | ---: |
| Initial | Node | 22.43 | 22.51 | 23.21 | n/a |
| Initial | Bun | 28.92 | 28.04 | 28.54 | n/a |
| Preallocated | Node | 22.79 | 22.92 | 23.25 | 23.49 |
| Preallocated | Bun | 28.72 | 28.87 | 28.12 | 28.30 |
| Receiver-reading | Node | 22.73 | 22.70 | n/a | 23.81 |
| Receiver-reading | Bun | 28.33 | 28.62 | n/a | 28.48 |

The narrow root consolidation does not establish a cross-runtime gain. The actual receiver-reading version is approximately 4.8% slower on Node and 0.5% slower on Bun in this screen. No allocation or GC-volume reduction is claimed from removing three source-level object constructions; frame growth and runtime optimization can change actual allocation costs. These results do not evaluate a compiler that emits instance-owned traversal directly and removes the surrounding generic invocation plumbing.

## Suspension and isolation

A separate diagnostic forces a promise from every third ready call on both StringProgramSink and CapturedProgramSink. The first probe instrumented only StringProgramSink and failed to induce pressure in the streaming fixture, so the probe was corrected before claiming coverage. The corrected test compares complete output with the control for three concurrent requests with distinct input titles, both fixture sizes, both modes, and both runtimes.

All 24 candidate/control comparisons pass. Each runtime induces 183 small-string, 105 small-stream, 1,113 large-string and 663 large-stream suspensions across its three-request groups. All three modified root writers are observed resuming with their receiver. This verifies the bounded fixture under suspension and concurrency; it does not cover arbitrary authored tasks, repeated same-frame rendering, error cleanup, observers, or a new compiler ABI. No browser/package acceptance run is claimed for the rejected bundle prototypes.

## Consequence

The subsequent [allocation and GC capture](instance-writer-allocation-2026-09-10.md) found effectively unchanged sampled allocation volume and collection counts for the receiver-reading prototype on Node.

Call or apply can support an instance-owned writer. Call syntax alone is not the material optimization. A stronger experiment would need to remove the existing preparation/invocation scaffolding or repeated fragment packaging, while retaining snapshot semantics, hoisted static invocations, stateless allocation savings and per-invocation continuation ownership. A full redesign has not been implemented or rejected by these measurements.

The current Node application hash remains `069f9784fa667af7896202923a6c08622ae1bb3f4060054328314dbe1ae6619b`. No compiler, production source, app source or frozen ABI fixture changed in this investigation. All owned processes closed. Evidence: `instance-bound-writer-2026-09-10-evidence.zip` contains instrumentation, raw counts, all bundle variants and timing populations, and both suspension-audit results.
