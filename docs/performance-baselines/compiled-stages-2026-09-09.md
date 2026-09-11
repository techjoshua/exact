# Staged publication through a compiled document tree

Date: 2026-09-09. Post-compilation experiment; production unchanged.

The fixture now compiles the authored html/head/body tree and both scheduled children. Five emitted
programs and 14 output operations are adapted to conditional continuations. Output results retain
their character-accounting values; returned child promises and pending sink drains settle before
the next operation. The test no longer hand-builds the parent or head render programs.

The runtime's document prefix and ordinary program-entry paths both honor an existing drain.
The latter was necessary: an asynchronously resumed child can begin after its parent has initiated
a flush. Checking only the child's subsequent operations allows its first write to violate pressure.

Twelve cases pass on Node/Bun, thresholds of 1, 8, and 8,192 bytes, and success/cancellation. Every
receiver write waits for explicit acceptance, and at most one write is outstanding. Success produces
the complete ordered expected document, matches its UTF-8 byte count, and captures two child
resumption records. Each child is disposed exactly once, and host ancestry is unwound. Cancellation
rejects with AbortError and releases both children without accepting the blocked transport write.

| Threshold | Successful chunks on each runtime |
| --- | ---: |
| 1 byte | 12 |
| 8 bytes | 11 |
| 8,192 bytes | 4 |

HTML assertions ignore compiler-generated data-exact-id attribute values while retaining them in
the raw traces and byte-count check. Hydration records are captured with the actual resumption
capture implementation, not a dummy flag, but are not yet serialized or inserted into output.

## Issues exposed while integrating

The first test stalled with one task started because the separately loaded fixture imported a
different module-local issuance helper than the bundled renderer's active issuance scope. The
builder now links that helper to the bundled scope, preserving its source semantics. Its unused
export had been tree-shaken from the comparison artifact, so the experiment restores the exact
pass-through helper against that existing scope. This is fixture linkage, not a production change.

With linkage corrected, the existing prototype boundary guard rejected nested resumable children
without a root capture. Installing the real capture retained their records and used the renderer's
existing captured-resumption path. The subsequent first-write backpressure violation led to the
program-entry drain guard described above. These failed attempts were setup/integration probes,
not discarded benchmark populations.

## Remaining work

The native compiler itself still emits the original writer contract; a reproducible postprocessor
performs this experiment's staging. Required markers, general enhancement captures, publication
retries, hydration serialization and placement, public transports, and performance remain to be
validated. Markers are disabled in these cases. No throughput, browser, HTTP, or React comparison
is claimed. The production artifact remains the retained unowned-program build.

The evidence archive contains compiler source inputs and complete response, original/transformed
runtime and fixtures, transformer, audit, raw traces, sink layers, and a verified SHA-256 manifest.
Built workspace packages are required by imports. The overall goal remains incomplete.
