# Detail composition and capture-order correction

Status: isolated prototype, not integrated or timed. No production source changed.

The prototype extends composed asset traversal to the detail's conditional ranges
and eagerly mapped comments. Generic child-group calls fall from 21 in the retained
small-document trace to 7. Program constructions remain 15 versus 22, writer
executions 21 versus 24, component executions 8, and sink writes 89. These are
call-entry counts, not CPU or allocation savings. Original generated block writers
and some capture containers remain; this is not yet full compiler integration.

## Corrected understanding of server capture

The earlier design and reports incorrectly described range callbacks as deferred.
`packages/core/src/framework/server-render-structure.ts` implements
`createCompiledChildRangeReceipt` by immediately calling `compute()`. The generated
server artifact uses this helper. The similarly named client helper creates a
computed value, but that is not the server execution path.

A post-capture component observer changes detail conflict, error, and job state.
Both retained and candidate HTML keep the previously captured values. The initial
test expected late alerts and failed for both implementations. Following the helper
resolved the discrepancy; the test now explicitly verifies eager capture and
identical component observation order. This correction simplifies the proposed
capture plan. Validation, child issuance, and writer execution still have ordering
requirements independent of expression capture.

The proposal, stage-one report, and asset report are corrected in the working tree.
Their older evidence archives preserve the original text and are not rewritten.
This report and its archive supersede their deferred-server-capture claims.

## Implementation corrections and validation

An inactive conditional produces a null child that still participates in traversal
accounting. The first specialized range assumed only an empty array or program and
failed. It now retains the null-child visit and its accounting.

The first comment traversal assumed a keyed wrapper. The compiler-proven keyed
helper already validates/coerces the key and returns the program directly. A case
with a nonempty requested comment list exposed the wrong assumption. The corrected
traversal consumes that direct program without redoing key coercion.

Checks on the corrected artifact:

- Sixteen changing full-output comparisons on Node and sixteen through the native
  Bun response entry point pass in string and stream modes.
- Six post-capture state checks pass across Node and Bun, using zero, one, and
  twelve comments on the requested incident. They compare complete output and
  component observation order and assert that late state changes do not change
  already captured HTML. Bun uses the portable artifact for this schedule probe.
- The 610-case Node string limit sweep matches output or error name/message in
  every case, including both sides of the success boundary.
- Ready string, ready stream, and forced-pending-head traces retain the original
  per-mode hashes and 4,672-byte output for the standard fixture.

Five targeted shell preparation-scope probes pass on each runtime: ready success,
pending success, child failure, cleanup failure, and simultaneous child/cleanup
failure. They assert exactly one disposal, no disposal before pending child
settlement, disposal before body close on success, no body close on failure,
balanced host/depth scopes, and preservation of the primary child error. These use
the asset-stage artifact and mocked child/preparation capabilities. They are not
compiled-task or cancellation integration coverage. The initial harness mistook
async cleanup completion for pending child work and left the outer scope too early;
the corrected harness awaits completion and distinguishes those cases.

No performance claim follows from these checks. Browser adoption, real task and
cancellation cases, and actual HTTP timing remain before acceptance. The next
diagnostic should establish the cost of the now-substantial traversal reduction,
while keeping this prototype's remaining proof limitations explicit.

The adjacent ZIP preserves corrected reports/proposal, builder and check scripts,
control/candidate limit artifacts, final traces and checks, cleanup probe evidence,
input fixture, and a verified SHA-256 manifest.
