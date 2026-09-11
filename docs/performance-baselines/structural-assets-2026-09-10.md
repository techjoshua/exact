# Composed asset traversal diagnostic

Status: isolated prototype, not integrated or timed. This extends
[stage one](structural-composition-stage-one-2026-09-10.md) toward the
[structural composition design](../proposals/ssr-structural-composition.md).

## Change

The shell's two asset positions directly traverse their compiler-issued range,
prepared list, and keyed asset programs. Asset parsing occurs eagerly during component preparation, before the
range is visited. The original report incorrectly described it as deferred. The existing list mapper constructs all its items before any
item writes. Script and stylesheet ordering, marker reservations, node/depth
charges, original asset writers, and sink readiness checks remain explicit.

This removes generic child-group construction and dispatch around the known
asset structure. It does not eliminate the range, list, keyed item, or item
program objects yet. The diagnostic rejects structures outside its script/link
scope; that restriction is not a proposed public API or a production proof.

The shell's app-wrapper scope now owns a separate output/preparation record.
Its prepared siblings are released as that scope completes, rather than leaving
them on the enclosing shell's output until document completion. A compiled task
and cleanup failure test is still needed before claiming lifecycle acceptance.

## Observations

| Work per ready render | Retained | Stage one | Asset traversal |
| --- | ---: | ---: | ---: |
| Prepared program constructions | 22 | 15 | 15 |
| Writer executions | 24 | 21 | 21 |
| Child-group renders | 21 | 20 | 12 |
| Component executions | 8 | 8 | 8 |
| Sink writes | 89 | 89 | 89 |

Counts come from isolated instrumented Node string output. Ready streaming also
matches complete output. This reduction is actual call-entry evidence; it is not
a percentage CPU or allocation saving. Extra specialized helper calls remain.

Sixteen changing-input comparisons pass on Node and sixteen through the native
Bun response entry point. Cases include no assets, repeated script URLs, query
escaping, increasing asset counts, Unicode content, empty comments, and a missing
incident. Full string and stream response texts match each runtime's retained
artifact. The first Bun check used the wrong export and failed before comparison;
the corrected harness calls `renderParticipantBunResponse` for both variants.

Three trace outputs match the corresponding retained hashes at 4,672 bytes:
ready string, ready stream, and a promise injected at head flush. This does not
simulate network pressure or application tasks.

A Node string limit sweep compares successful complete output or error name and
message for 610 cases: node limits 1-500, depth limits 1-30, and output limits
64-5120 in steps of 64. Every pair agrees. Both first succeed at 151 nodes and
depth 5; the first sampled successful output limit is 3840 bytes. Output limits
apply to their existing rendering boundary, so this is not a claim that a 3840-byte
limit bounds the final hydrated response. Stage one passes the same sweep.

The first node sweep stopped at 100 and contained only failures. It was extended
to 500 to test both sides of the success boundary. This coverage is still one
fixture and one entry point, not general resource-limit equivalence.

## Remaining work

Continue with the detail's eager range captures and eager comment list. Preserve
evaluation and failure order while removing their intermediate traversal. Add
adversarial checks for prepared-sibling ownership and failures across suspension,
then validate browser hydration and actual HTTP performance. No package suite,
browser acceptance, throughput gain, or broad semantic equivalence is claimed.

The adjacent archive contains the builder, check and limit harnesses, trace
instrumenter, prototypes, raw checks, limit outcomes, traces/summaries, this
report, input fixture, and SHA-256 manifest. No production source or retained
artifact changed.
