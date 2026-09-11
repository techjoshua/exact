# Interpreting the recent SSR experiments

This analysis uses completed captures. No additional timing workload was started.
The conditional-fragment prototype is paused after output checks, before tracing
or throughput measurement. The immediate task is causal understanding, not another
candidate score.

## The frame experiment's means overstate the string evidence

Reanalysis of the 72 HTTP blocks gives:

| Mode | Change in mean RPS | Median paired change | Positive pairs | Mean change after omitting any one block |
| --- | ---: | ---: | ---: | ---: |
| Node string | +4.23% | +0.23% | 3/6 | +1.51% to +6.14% |
| Node stream | -0.90% | +0.80% | 4/6 | -3.23% to +2.53% |
| Bun string | +2.25% | +0.74% | 5/6 | +0.45% to +2.79% |
| Bun stream | -0.73% | -0.87% | 1/6 | -0.92% to -0.60% |

These sensitivity calculations describe the same observations. They are not
confidence intervals, independent repetitions, adjusted benchmark scores, or
permission to discard unfavorable blocks. All observations remain in the report.

Node string's six paired changes are -4.58%, -4.89%, +19.28%, -3.46%, +3.92%,
and +19.54%. The two large positive blocks have control rates of approximately
8,837 RPS, versus roughly 9,852 to 10,505 in the other four. Candidate rates stay
between 9,639 and 10,563. This could reflect a runtime-state difference or unrelated
machine interference. There is no telemetry here establishing which. The mean
does not demonstrate a dependable four-percent improvement per request.

Bun string's first block improves 12.09%; the other five range from -0.43% to
+0.93%. Omitting that first block as a sensitivity calculation leaves +0.45%.
The five positive pairs suggest a possible small benefit, substantially smaller
than the headline mean. Candidate-before-control blocks average +0.58%, while
candidate-after-control blocks average +3.97%, largely reflecting that first block.
This is insufficient to diagnose an ordering mechanism.

Node streaming is especially unstable: one pair is -17.00% and another +10.68%.
Its negative mean and positive median cannot resolve a small effect. Bun streaming
has the most consistent direction: five negative pairs, and a negative mean under
every single-block omission. That is stronger evidence of a small downside in
this capture, not proof of the underlying cause or permanent runtime behavior.

## What the frame change actually removed

The prototype removes 22 eager-value array constructions per small request. It
retains 22 request-local invocation records, replacing the original constructor
with per-arity factories. Generated helpers receive the captured value directly
instead of reading it through the invocation's array. The validation itself stays.

It does not remove the 24 program writer executions, eight component executions,
89 sink writes, component state preparation, hydration serialization, or HTTP
response handling. It is a data-layout and access change, not a composed root
render program. Its opportunity is therefore narrower than the root-wide proposal.

The current experiment has no allocation or GC profile. Fewer source-level arrays
does not establish fewer allocated bytes after optimization, fewer collections,
or less GC time. The earlier analogous flat-frame experiment estimated only
0.75% less allocation for the small fixture and 1.24% for the large one. Those
numbers are context from a different build, not measurements of this candidate.

There is also a plausible cost: per-arity records have varying object layouts,
where the old wrapper has a uniform layout and varying array lengths. The earlier
flat-frame diagnostic observed more V8 maps. Neither that observation nor this
run proves that polymorphic property access or deoptimization caused the slowdown.
There is no current JIT evidence supporting that attribution. The previous padded
layout experiment already failed to establish an improvement and increased large
allocation, so padding is not an untested solution.

The candidate changed no sink policy. Consequently these results do not establish
that named fields inherently favor string sinks or hurt streaming sinks. That
would require explaining how the changed layout behaves in each execution context.

## What helped with stronger evidence

The retained conditional-emission change has a more complete causal chain. A trace
identified a ready head flush returning a promise and suspending ancestor writers.
The change removed that suspension when output was already ready, preserved the
pending-pressure behavior, and left output and component/write counts unchanged.
Node stream improved 5.7% with six positive pairs; Bun stream improved 4.1% with
five positive pairs. Package and browser validation covered early head output,
actual pressure, cancellation, and hydration. This is stronger evidence than a
layout change with a favorable aggregate mean and no current GC/JIT attribution.

The shell-only fusion removed three invocation wrappers and writer executions but
measured +0.25% with three positive pairs. It establishes that those dispatches can
be removed in the fixture; it does not establish that they explain the large Node
string deficit. Extending the same mechanism across the application must be
justified by the work affected, not by assuming a root cache is automatically fast.

## Where the larger unresolved gap is

In the most recent capture, current eXact needs about 34.0% more Node string RPS
to match React. Bun string needs about 3.3%, and Bun stream about 0.9%. Node stream
already exceeds React by about 38.5%. These are comparisons within each capture,
not stable capacity forecasts. A general change should preserve the Node streaming
advantage rather than optimize a tight string loop alone.

Previous context diagnostics remain important:

- Isolated Node rendering plus byte counting favored eXact, 22.35 microseconds
  versus React's 24.51. That did not predict the HTTP gap.
- The instrumented HTTP synchronous renderer interval was 45.79 microseconds for
  eXact and 33.45 for React. The instrumentation affected throughput materially,
  so these are location clues rather than a precise CPU budget.
- In the four-renders-per-request diagnostic, eXact's first render was 54.44
  microseconds and later renders averaged 31.77. React's were 36.05 and 24.44.
  Both improve on repetition, with a larger eXact difference.
- Importing adapter/server modules, adding monitoring, grouping ready renders,
  and yielding between groups did not reproduce the HTTP penalty in isolation.

These observations justify studying the first render after intervening HTTP work.
They do not identify GC, CPU caches, JIT, or transport as the cause. In particular,
an array count is not yet an explanation for a roughly one-third throughput gain
needed on Node string. Additional Promise removal also failed to produce stable
HTTP improvements in the completed adapter/harness experiments.

## Direction and decision

Keep the current production renderer and the proven conditional-emission change.
Retain the frame prototype as evidence of a possible small Bun string benefit
and a small Bun streaming downside; do not describe it as a confirmed general win
or a confirmed general regression. Do not resume representation tuning without a
specific explanation supported by allocation or JIT evidence.

The root-program proposal remains architecturally plausible. The compiler already
combines ordinary nested tags; the remaining structural boundaries include JSX
conditionals, lists, component ownership, tasks, and enhancement capture. A useful
proposal must state which of those boundaries consumes meaningful HTTP rendering
time, which work is removable, and what remains request-local. Counting wrappers
alone does not supply that justification.

Before benchmarking the paused fusion prototype, analyze the actual HTTP render
costs by stage and distinguish execution from GC or suspension. Use any necessary
diagnostic specifically to explain the observed gap, not to generate another
candidate percentage. Then select a change whose predicted benefit follows from
that evidence. This is a change in investigation order, not a claim that the
remaining performance problem is solved.

## Evidence references

- [Frame HTTP results](inline-slot-frame-http-2026-09-10.md)
- [Root-program and shell audit](root-program-audit-2026-09-10.md)
- [Retained conditional emission](conditional-emission-2026-09-10.md)
- [HTTP completion and render intervals](http-completion-2026-09-10.md)
- [Rendering context controls](render-context-2026-09-10.md)
- [Earlier flat frame allocation and shape audit](flat-invocation-2026-09-10.md)
- [Padded layout follow-up](flat-invocation-padded-2026-09-10.md)

The interpretation script and per-block derived results are preserved in
`ssr-results-interpretation-2026-09-10-evidence.zip` with the original HTTP rows and
a SHA-256 manifest. Existing experiment archives remain unchanged.
