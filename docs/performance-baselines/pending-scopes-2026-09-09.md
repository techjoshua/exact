# Pending continuation scopes, September 9, 2026

Status: rejected prototype. Production retains the synchronous-publication callback optimization
and all preceding retained changes. No public API, ABI, or production source changed here.

## Hypothesis

Callbacks confined to a pending branch can still affect allocation of their enclosing lexical
environment. Separating those callbacks into helpers invoked only when needed might reduce
large synchronous-tree render time by 1-4%. This was an implementation hypothesis, not an assumption
that the engine necessarily allocates such storage for every function call.

The bundle-only prototype extracts three scopes: pending child-depth cleanup, pending program-output
continuation, and document-host cleanup. All counters, publication order, host checks, captured values,
and existing rendering operations remain in place. Promise settlement still resumes the same loop.
The source transformation asserts that each of the three replacement boundaries occurs once.

## Results

Twenty-four fresh sequential production processes: Node/Bun, string/stream, 96 incidents, three
alternating-order pairs per combination. Each warms 5,000 renders and measures 12,000. Streams are
fully consumed through Response.text. Both runtimes use the same portable renderer artifact, render
full application-owned documents with empty asset tags, and validate final complete-response hashes
against the retained build. All hashes match.

Median microseconds per render, lower is better. Positive paired change means slower. The final
column is the median of per-round changes, not a ratio of independent medians.

| Runtime | Mode | Previous | Prototype | Paired change |
| --- | --- | ---: | ---: | ---: |
| node | string | 172.76 | 157.43 | -5.3% |
| node | stream | 188.30 | 196.01 | +1.3% |
| bun | string | 248.53 | 226.05 | -7.6% |
| bun | stream | 288.30 | 307.01 | +5.9% |

String results are mixed. Bun streaming regresses in all three pairs, and Node streaming regresses
in two of three. The prototype is not adopted. These short shared-PC samples do not establish
confidence intervals, but they do not support a general throughput improvement.

A separate Node allocation sample estimates 520.6 KB per large render versus the preceding
531.8 KB, approximately 2.1% lower. The sampler runs after 5,000 warmups for 10,000 renders with
16,384-byte sampling and includes collected objects. These are allocation-volume estimates, not
retained heap or leakage. Source attribution can shift with inlining; the child-depth function's
attributed volume remains approximately unchanged. The allocation reduction does not outweigh
the observed streaming regressions for this implementation.

## Follow-up ownership audit

The repeated leaf-component path also installs a child issuer and preparation scope through
renderIssuedServerComponentChildren. That scope starts scheduled children as references are
created and disposes unconsumed children, including children created before rendering throws.
Its purpose is real; a final output containing only intrinsic elements does not prove the scope
was unnecessary. Authored calls and property getters can execute while constructing output.
Any compiler leaf proof must account for possible child issuance during that work, not merely
scan the final returned program. No shortcut at that boundary is implemented by this experiment.

Earlier lazy-preparation/cleanup experiments already exist in the allocation investigation and
must not be repeated without a distinct hypothesis. The next useful direction is stronger evidence
about component preparation and compiler-known effects, rather than another unconditional helper
extraction or removal of task ownership.

## Evidence

No production tests were rerun for this discarded bundle prototype. Hash parity covers the measured
fixture, not all pending/error paths; adoption would still require the existing ordering, depth,
document-host, and cleanup tests. React was not rerun, and no new HTTP or browser timing is claimed.
The archive contains builders, runners, raw results, allocation profiles, fixed input, control and
prototype artifacts, and the inspected source boundaries. All owned child processes exited.
