# Hydration before staged document closure

Date: 2026-09-09. Prototype integration; production unchanged.

The compiled-tree experiment now identifies its closing-body operation as a tail boundary. The
document sink retains that closing tag and subsequent closing-html output, then invokes the
existing hydration serializer once after rendering and resumption capture finish. It emits the
framework-body envelope and hydration script before releasing the retained tail. Every byte write
honors pressure and the existing output-limit ledger.

Twelve compiled-tree cases pass across Node/Bun, 1-, 8-, and 8,192-byte thresholds, and successful
completion/cancellation. Successful requests serialize exactly once, retain both captured child
resumptions, emit parseable JSON using the existing script-safe encoding, and finish with the
hydration envelope followed by closing body/html tags. The fixture includes a state string with
closing-script text and U+2028; raw closing-script injection is absent. Final UTF-8 byte counts
match the complete output, and each child is disposed once.

Six focused failure cases pass across the two runtimes: unsupported NaN state, insufficient output
budget, and cancellation while the hydration write is awaiting acceptance. They reject, clear
pending data, close the sink, and emit neither closing body nor closing html afterward. Previously
published content cannot be withdrawn. A test assertion initially expected the word "limit" in the
byte-limit error message; it was corrected to match the existing "configured maximum" wording.

## Limits

This remains a post-compilation transformation of a controlled document. The tail event is inserted
at the fixture's unique compiler-emitted closing-body operation; it is not a generic HTML string
search in the sink, but native compiler emission of the event is still required. A general design
must handle compiler-folded closing markup and arbitrary supported document structure.

The prototype retains tail strings until completion and awaits writes in its finalization routine.
That routine has not been optimized or benchmarked. Markers remain disabled in these cases, and
browser adoption of this experimental response has not been tested. Public transport integration,
required boundaries, publication retries, and compiler-owned staging remain unfinished. The
existing hydration validator and serializer are reused without relaxing accepted-value rules.

No throughput, HTTP, browser timing, or React comparison is claimed. Production and its benchmark
artifacts remain unchanged. The evidence ZIP contains input/transformed artifacts, sink layers,
builders, audits, raw traces, and a verified SHA-256 manifest. Built workspace packages are required.
The overall goal remains incomplete.
