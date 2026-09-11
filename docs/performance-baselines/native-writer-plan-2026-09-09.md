# Native SSR emission plan

Date: 2026-09-09. Compiler integration foundation, no runtime performance change.

The direct-writer experiments identify suspension sites by rewriting generated JavaScript. Native
compiler inspection confirmed that the current emitter constructs one statement list: slot reads
and validation, budget initialization, output-array allocation, character-count initialization,
ordered writes, and return. Its synchronous helper contract cannot accept a promise where a
character count is expected.

The emitter now returns a native plan before materializing the existing writer function. Each
write site records its statement position, operation name, and whether it assigns the settled
result to the character counter. Preparation remains in its original position and is excluded
from the write-site list. The function wrapper consumes the same statement list and preserves the
current three-parameter ABI and output-array contract.

This is preparation for native continuation emission, not completed sink integration. The recorded
write sites are not yet used to emit suspending writers. No second runtime engine, public compiler
option, or compatibility alias was introduced. Compiler-side bookkeeping has not been benchmarked.

Native tests verify that child and text write sites refer to the actual emitted calls, remain
ordered, exclude budget preparation, and retain character-assignment ownership. Full native
compiler and command tests pass; the compiler is rebuilt and stamped. During validation, a second
build with the new test overlapped the earlier rebuild; both completed successfully. Final checks
use the completed compiler, not an in-progress executable.

Fresh compilation exactly matches stored output for the two-child server document, 96-child
server document, and the corresponding client hydration fixture. The comparison client and both
server targets rebuild successfully. The Node participant SHA-256 remains
`3a0683d59c2264901d7e45eaf686e2d15b51e80eeaabc651f2062e77aea1bba2`, and the client asset remains
`index-CdIXDKwS.js`. Source architecture checks pass. No new SSR or browser timing is claimed.

Next integration work must consume the native write-site plan to emit conditional continuations,
pass request-owned output explicitly, and migrate the runtime helper contract together. Selective
task waiting additionally requires dependency proof; moving write statements alone does not make
eagerly prepared inputs safe to read before their tasks settle. The broader performance objective
remains incomplete.
