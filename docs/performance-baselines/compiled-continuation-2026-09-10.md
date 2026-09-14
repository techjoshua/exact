# Compiled continuation trace, September 10, 2026

The retained compiler already executes ready render programs synchronously. Its generated switch
advances directly until a child or sink reports pending work. Only that branch allocates the saved
continuation array and attaches a promise callback. Constructing a promise for every component would
add work to this ready path. Native promise executors run synchronously; their reaction callbacks
still run asynchronously.

A diagnostic AST transformation instruments generated `__exactRun` functions and continuation-array
declarations in the retained conditional-emission Node bundle. The fixture renders live application
components and a full application-owned document with four asset tags and fresh hydration data.
After 1,000 warmups, one request per mode is traced and compared with the uninstrumented bundle.

| Mode                                        | Generated writer entries | Saved continuation arrays | Response bytes |
| ------------------------------------------- | -----------------------: | ------------------------: | -------------: |
| Ready string                                |                       18 |                         0 |          4,672 |
| Ready stream                                |                       18 |                         0 |          4,672 |
| Stream with one injected pending head flush |                       19 |                         1 |          4,672 |

The final row is a positive instrumentation control: the probe substitutes a resolved promise for
one synchronous head-flush result. It proves the continuation counter observes a forced pause and
resume. It is not a real transport-pressure measurement. All outputs match their uninstrumented
controls exactly, and traced synchronous scopes balance. String and streaming output hashes differ
from each other because of their existing protocol representation, not because of instrumentation.

No production code changes or throughput claims follow from this trace. Instrumentation itself
adds work and promise observers. Public asynchronous completion and scheduled component execution
remain separate from generated writer continuation allocation. The ready benchmark exercises eight
synchronous component executions, so changes confined to scheduled artifacts cannot explain its gap.

[Evidence archive](compiled-continuation-2026-09-10-evidence.zip) preserves the probe, source bundle,
traces, summaries, compiler continuation sources, and SHA-256 manifest.
