# Capacity-triggered writer continuations

Date: 2026-09-09. Experimental code generation and integration checks.

The pressure prototype now exposes its pending drain, and the native-compiled child fixture's
root-opening and text operations are transformed into conditional continuations. Each operation
executes once, retains its character-accounting result, and resumes the next operation only after
the sink accepts the current write. When no drain exists, the continuation executes immediately.
The document-entry wrapper also waits after a doctype prefix that fills the sink.

This transformation is a post-compilation experiment over two generated leaf operations. The
parent and head programs are hand-built and use explicit awaits. The native compiler has not been
changed to emit this staging, and the parent's unconditional awaits are not a proposed fast path.

Twelve cases pass across Node/Bun, thresholds of 1, 8, and 8,192 bytes, and success/cancellation.
The receiver deliberately returns a pending promise for every emitted chunk. The harness accepts
one chunk at a time and asserts that a second transport write is never outstanding concurrently.
Successful concatenated output equals the complete expected document and its UTF-8 byte count.
Cancellation rejects with AbortError; both distinct compiled children are disposed once and host
ancestry is unwound.

| Threshold | Successful chunks on Node | Successful chunks on Bun |
| --- | ---: | ---: |
| 1 byte | 9 | 9 |
| 8 bytes | 8 | 8 |
| 8,192 bytes | 4 | 4 |

Unlike the preceding capacity probe, the one-byte case completes without attempting a write
through backpressure. This supports the staged-write contract for the tested operations. It does
not establish coverage of all attributes, markers, enhancement captures, component boundaries,
or arbitrary compiler output. The fixture still omits hydration publication.

The next integration must generalize the result/drain contract across output operations, preserve
the immediate path for string sinks, and let the compiler emit those continuations. It must also
coordinate hydration and final document closure through the same sink. No throughput, browser,
HTTP, or React comparison is claimed; the additional staging overhead has not been benchmarked.
Production is unchanged, and the overall goal remains incomplete.

The evidence archive contains the input and transformed artifacts, generation script, sink layers,
task fixture, audit, raw publication traces, and a verified SHA-256 manifest. Built workspace
packages are required by the imports.
