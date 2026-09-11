# Combined document shell diagnostic, September 10, 2026

This is a diagnostic prototype, not the default framework implementation. It combines a literal
asset list, one generated document-shell writer, and application-only hydration publication.
Application components still render per request through the shared renderer and existing sinks.
Hydration data is fresh. The document still owns HTML, head, and body output and preserves the head
flush. React is unchanged.

| Runtime and output | Retained eXact requests/s | Prototype requests/s | React requests/s | Prototype improvement |
| --- | ---: | ---: | ---: | ---: |
| Node string | 7,447 | 9,085 | 10,147 | 22.0% |
| Node stream | 5,898 | 7,384 | 4,066 | 25.2% |
| Bun string | 10,068 | 12,451 | 9,436 | 23.7% |
| Bun stream | 8,005 | 9,422 | 8,356 | 17.7% |

The prototype improved all six paired blocks in each cell. Node string remains 10.5% behind React.
These are short local measurements with concurrent user PC activity, not dedicated-machine capacity
claims. In particular, Bun's React control varied substantially. The combined result does not assign
the improvement to any one of its three changes.

Production Node 26.8.1 and Bun 1.4.2 used their native adapters. All six variant permutations were
measured in each of four runtime/output cells: 72 blocks, 10 seconds of warmup per worker, 1.5 seconds
per measured block, two drivers with concurrency 16 each, and below-normal process priority.
There were 918,433 valid responses and zero errors. Response hashes were checked throughout.
Changing Unicode request fixtures checked normalized document output and hydration JSON separately.

The prototype also passed 56 browser checks across Node/Bun string/stream, including application
hydration and interactions. Its browser entry explicitly adopts the application under `#app`,
with matching application identity, props schema, and markerless-root metadata. Merely dropping
document props from the existing document-hydration entry would not be equivalent.

A server-only enclosing shell should not publish state for application hydration. An explicitly
client-reactive document remains a separate supported ownership case. Generalizing the prototype
requires expressing that boundary in the framework, preserving tasks, context, lifecycle, root
metadata, and client adoption. No application-specific prototype branch was installed in production.

The separately retained literal-URL compiler optimization is described in
[the compiler experiment report](literal-url-compilation-2026-09-10.md). It does not install this
combined prototype or change the normal benchmark's dynamic asset expressions.

Reproduction scripts, frozen artifacts, raw measurements, browser logs, verification results, and
SHA-256 manifest are preserved in
[the evidence archive](combined-shell-2026-09-10-evidence.zip). Historical isolated experiments remain
in [the static-shell report](static-shell-2026-09-10.md) and
[the application-hydration report](application-hydration-2026-09-10.md).
