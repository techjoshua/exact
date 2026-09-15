# Inline slot frame HTTP follow-up

Status: isolated compiler/runtime ABI prototype. No production changes adopted.

Subsequent [paired-block interpretation](ssr-results-interpretation-2026-09-10.md)
shows that the string means overstate the typical paired gains and that Node
streaming's direction is unresolved. Consult that analysis before selecting a
follow-up. The conditional-fragment prototype is paused before benchmarking.

## Hypothesis and relationship to prior work

The preceding root program audit identified request-created invocation wrappers and
their eager slot arrays. This experiment replaces each pair with one request-local
object containing the brand, descriptor, and named slot fields. Hoisted per-arity
factory functions create those objects. Generated preparation passes slot values
directly to the existing unwrap/validation helpers. Evaluation order is retained.
The hypothesis is a low-single-digit throughput gain from fewer allocation sites
and simpler slot reads, not that this closes the entire React gap.

This is a follow-up to [flat invocation](flat-invocation-2026-09-10.md), not a new
root-wide renderer. The earlier experiment measured response consumption and
sampled allocations. This one measures actual HTTP throughput with the retained
conditional-emission build. The older padded-frame experiment already rejected
shape padding; it is not repeated here. Earlier allocation estimates cannot be
attributed to this candidate without a new allocation measurement.

The asserted transformation updates 25 invocation construction sites, 25 direct
slot reads, 38 preparation calls, and five preparation helpers in each bundle.
Trace counts show 22 request-local frame factory calls, no calls to the old
invocation constructor during the request, and unchanged writer/component counts
of 24/eight. The intermediate child topology remains. This experiment removes
slot-array construction, not traversal or component lifetimes.

## HTTP results

| Runtime/mode | Current eXact RPS | Candidate RPS | React RPS | Candidate change | Paired wins |
| ------------ | ----------------: | ------------: | --------: | ---------------: | ----------: |
| node string  |             9,773 |        10,186 |    13,099 |           +4.23% |         3/6 |
| node stream  |             7,154 |         7,090 |     5,163 |           -0.90% |         4/6 |
| bun string   |            10,545 |        10,783 |    10,890 |           +2.25% |         5/6 |
| bun stream   |             8,523 |         8,461 |     8,598 |           -0.73% |         1/6 |

There are 994,995 valid responses and zero reported errors across 72 measured
blocks. Each runtime/mode uses all six orders of the three variants, production
mode, below-normal priority, ten seconds of warmup per worker, 1.5-second measured
blocks, and two drivers with sixteen connections each. Node string was the initial
screen; the remaining modes ran subsequently. Only one timing workload ran at a
time. The user can be using the PC, and machine conditions vary across blocks.

The initial Node string mean improved, but only three of six paired blocks won.
Node streaming also has mixed evidence. Bun string improves in five of six pairs,
while Bun streaming regresses in five of six. These captures do not establish that the
representation change reliably improves the shared renderer. No hard minimum
percentage is used as an acceptance rule. The unresolved issue is confidence in
the benefit relative to an ABI redesign and its wider validation requirements.

## Correctness and limitations

Eight changing-request full-output comparisons pass across Node string/stream,
empty and changing asset lists, Unicode/script-like text, and an empty comments
list. Trace instrumentation preserves candidate output in ready string, ready
stream, and artificially pending head-flush cases. Trace hashes match the retained
build's corresponding traces. All measured HTTP blocks validate the full expected
response identity; candidate and control document bodies match per runtime/mode.

This is a generated-bundle prototype with no enhanced invocation arguments. It
does not establish semantics for arbitrary external helper callers, enhanced
invocations, reentrant disposal, or the client slot reader. Package and browser
acceptance suites were not run. Compiler and runtime source contracts remain
unchanged; the old unused helper is diagnostic scaffolding only.

## Larger structural target

`jsx_render_program_lowering.go` already combines ordinary nested intrinsic tags
through `appendRenderProgramElement`. JSX-bearing structural expressions instead
use `visitor.VisitNode(expression)` followed by `build.childSlot`, preserving an
opaque value that returns to generic traversal. This includes the detail panel's
conditional fragment and keyed list content. A broader reusable root program must
compile branch/loop execution, not merely cache or relabel those request objects.

The next distinct experiment should fuse one application conditional fragment's
known intrinsic programs into explicit ordered sink operations. Preserve eager
expression evaluation, sibling task issuance, hydration markers, document depth,
enhancement capture, and cancellation cleanup. Dynamic component identity and
state remain request-owned. Trace the removed child-group/writer dispatch before
claiming a timing improvement. No numerical gain from that unimplemented design
is established here.

## Evidence

The accompanying evidence archive contains scripts, transformed/control bundles,
verification output, traces, all HTTP rows, source snapshots, and a verified
SHA-256 manifest. The root-program audit's prose hash correction is also included;
its older archive remains intact. Canonical Node/Bun Exact artifacts match the
retained conditional-emission controls. The overall React throughput goal remains
unmet.
