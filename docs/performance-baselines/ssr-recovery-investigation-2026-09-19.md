# SSR performance recovery investigation, September 19, 2026

The preceding [full capture](wsl-optimized-final-2026-09-19.md) reported a 15.5% decline in
Node preloaded streaming and a 4.9% decline in Node normal string rendering, using the
eXact/React ratio against the [pre-optimization workspace capture](wsl-workspace-2026-09-19.md).
Those results prompted further profiling, candidate experiments, and direct before/after controls.

All comparisons below use the eXact/React ratio as the performance signal. The historical
declines remain in their original capture. The controls investigate whether restoring the
original renderer restores its historical ratio, and whether an additional change improves
the retained implementation.

## Artifact and measurement controls

The original and retained server bundles match the archived full-run artifacts byte for byte:

| Renderer                                   | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| Original, before hydration-slot provenance | `9b392083fbfdbc3ee8298f31484192cd952fb0e4283dd7d27c129543325e9d8d` |
| Retained hydration-slot provenance fix     | `4b7ef94ef04c2260126661ea53fde5e29587a308e974e8db635324e3609a82c6` |

Focused HTTP tests use the production benchmark worker and Node adapter, two independent
drivers, and both eXact/React and React/eXact populations. Each population owns fresh workers.
Completed captures retain artifact identities, telemetry, response identities, and errors.
The initial focused streaming plan uses ten seconds of c32 warmup followed by fifteen seconds of c32
measurement. Later admission, prepared-program, and hydration-provenance controls use the full
preloaded plan through c32: ten seconds of c16 warmup, fifteen seconds at c16, then fifteen
seconds at c32. Normal string controls use ten seconds of c16 warmup, fifteen seconds at c16,
then fifteen seconds at c32. The full matrix's normal-loading plan instead uses ten seconds
of c16 warmup followed by twenty seconds at c32. Focused controls remain separate from the
full matrix and its additional preloaded concurrency and arrival stages.

## Node preloaded streaming

The first direct comparison measured an original-renderer ratio of 2.905x and a retained-fix
ratio of 2.928x. Two further retained-code controls surrounding the transport experiment
measured 2.984x and 2.982x, both above the historical 2.952x reference. Their eXact throughput
was 11,766 and 11,684 valid RPS. No completed focused HTTP capture had a request error.

The previously reported 2.494x result was not reproduced as a stable effect of the retained
fix. This does not establish the cause of that individual capture. It establishes that the
unchanged retained renderer can exceed the reference ratio under these focused controls.

## Node normal string rendering

Four runs used original/retained/retained/original order, each retaining both framework-order
populations:

| Run | Renderer | eXact RPS | React RPS | eXact/React |
| --- | -------- | --------: | --------: | ----------: |
| 1   | Original |     3,358 |     2,814 |      1.193x |
| 2   | Retained |     3,490 |     2,763 |      1.263x |
| 3   | Retained |     3,578 |     2,698 |      1.326x |
| 4   | Original |     3,317 |     2,797 |      1.186x |

The arithmetic mean of the two retained run ratios is 1.294x, versus 1.190x for the two
original runs, an 8.8% improvement. The retained mean also exceeds the historical 1.270x
reference. Individual runs straddle that reference, so this is not a claim that every run
must exceed it. Restoring the original renderer did not recover its historical ratio.

## Candidate experiments

HTTP CPU profiling identified stream delivery, hydration validation and serialization,
component execution, and allocation as remaining costs. Isolated rendering probes preserved
the fixture's completed HTML identity. They served as screening measurements; changes needed
an HTTP benefit before retention.

| Candidate                                                                                                                                                 | Evidence and decision                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avoid unconditional awaits for synchronous stream events                                                                                                  | Isolated improvement did not become a useful HTTP gain: 2.921x versus 2.928x for the retained control. Rejected.                                                                                |
| Defer exact UTF-8 counting until a byte limit or flush threshold approaches                                                                               | Small isolated gain was inconsistent over HTTP: 2.809x and 2.968x, with original controls at 2.988x and 2.904x. Rejected.                                                                       |
| Node `Readable.fromWeb` and `pipeline` transport                                                                                                          | Ratio fell to 1.505x and eXact throughput to 5,769 RPS, versus retained controls near 2.983x and 11,700 RPS. Rejected. A subsequent repetition was stopped and excluded from completed results. |
| Prepared-program class allocation, no-output event handling, combined byte-counting changes, single-pass JSON escaping, and projectors for smaller arrays | Isolated screening did not establish a consistent benefit. Rejected.                                                                                                                            |

Prepared-program class allocation also received four HTTP controls. The class variant reached
2.712x and 2.783x, versus retained controls at 2.784x and 2.912x. Its mean ratio was 3.5% lower,
so the core allocation design was left unchanged.

Node already batches outgoing socket writes, so an extra manual corking layer was not added.
Hydration validation, output limits, cancellation, and backpressure contracts remain intact.
No additional runtime change from these experiments was retained. The original hydration-slot
scan avoidance remains in place.

## Evidence and full verification

The [complete recovery capture](wsl-recovery-2026-09-19.md) recovered all four string ratios
and both Bun streaming ratios. Node streaming remained 7.6% below reference preloaded and
4.3% below with normal loading. The shorter streaming controls therefore did not establish
full-plan recovery.

Further Node controls replayed the full preloaded plan through its c32 stage, retaining both
framework-order populations. The original renderer reached 2.858x; retained-code controls
before and after the candidates reached 2.744x and 2.680x. Disabling adaptive admission fell
to 1.495x. Sharing admission-completion callbacks reached 2.703x, and combining that change
with removal of redundant listener wrappers reached 2.750x. Neither listener experiment
established a repeatable improvement, and disabling admission was substantially worse.

A separate instrumented run recorded admission decisions. Scheduling was enabled in 56 of
60 samples during c32. The only observed policy reversal was the existing 30-second routine
reassessment, followed by successful re-enablement. No early capacity or lag reversal was
observed. The controller's immediate windows briefly reduced throughput, but the reference
implementation has the same policy, so this cost does not by itself explain the historical
ratio change. The policy remains unchanged.

Restoring original streamed-result construction and omitting unused chunk annotations also
failed to establish a consistent isolated benefit. V8 traces showed that neither the original
nor retained result constructor was inlined into the main collection function in those runs.
No inlining regression at that call was established.

## Hydration provenance ownership experiment

A narrower candidate moved hydration-slot knowledge out of shared result construction and
into the completed string sink. Streaming then used the original result constructor, while
string output retained the no-scan fast path. Unknown output and extension replacements
continued to scan for a marker.

The first preserved-bundle prototype used an enumerable private symbol on completed chunks.
Its original/candidate/candidate/original controls showed a 4.2% streaming ratio improvement,
but a 1.0% string ratio decline. It was not accepted on that evidence.

The production proposal used a non-enumerable private symbol, released the mutable request
context when the sink finished or was destroyed, and passed all 460 SSR tests. Its rebuilt
artifact failed the streaming confirmation:

| Run | Renderer            | eXact RPS | React RPS | eXact/React |
| --- | ------------------- | --------: | --------: | ----------: |
| 1   | Retained control    |    11,174 |     3,856 |      2.898x |
| 2   | Production proposal |    10,702 |     3,745 |      2.858x |
| 3   | Production proposal |    10,023 |     3,827 |      2.619x |
| 4   | Retained control    |    10,354 |     3,776 |      2.742x |

The candidate mean ratio was 2.9% below the control mean. It was rejected before spending
more time on its string confirmation. The source changes were reverted, generated candidate
files removed, and the rebuilt Node artifact verified byte-for-byte against the retained
bundle. The archive preserves the rejected patch and its added helper for reproducibility.

These experiments do not establish one cause for the historical streaming deficit. Restoring
the original renderer did not reliably restore the reference ratio under the full-plan prefix;
removing admission or replacing the transport made performance materially worse. The unchanged
renderer exceeded the reference in shorter controls but not in the first complete recovery
matrix. Those results limit what can be attributed to the hydration-slot optimization. They do
not erase the measured full-run deficits or establish that WSL alone caused them.

## Final outcome and remaining limitation

The final full matrix retained six ratios above the workspace reference. Node preloaded
streaming remained 6.5% below reference (10,945 valid RPS, 2.759x eXact/React), and Node normal
streaming remained 10.2% below reference (2,866 valid RPS, 1.408x). Full recovery was not achieved.
No speculative runtime optimization from this investigation was shipped.

The evidence explains why the tested approaches were not retained, but does not prove the
root cause of the historical Node streaming difference. The production HTTP profile identifies
stream delivery, hydration validation/serialization, and allocation as remaining costs. The
admission trace also identifies a routine measurement-window cost. Each tested attempt to
remove or reduce those costs either regressed throughput or failed to repeat its gain. In
particular, restoring the pre-optimization renderer was not sufficient to recover the full-plan
reference, and the retained renderer could exceed it only in shorter streaming controls.
It would therefore be unsupported to claim that reverting the string fix, changing admission
policy, or replacing the transport resolves the gap. The remaining Node streaming deficit is
explicitly unresolved, rather than attributed to an unverified environmental or compiler cause.

The [structured focused results](ssr-recovery-investigation-2026-09-19.json) retain every
completed HTTP control and identify the incomplete transport repetition. The
[investigation archive](ssr-recovery-investigation-2026-09-19-evidence.zip) contains the
raw captures, runners, preserved bundles, rejected source proposal, and profiles. The subsequent
[full verification capture](wsl-recovery-final-2026-09-19.md) measures the retained implementation
across the complete comparison matrix.
