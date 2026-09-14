# Compiled writer stack experiment

Status: two scratch variants implemented and rejected as performance changes.
Production source, package contracts and canonical builds are unchanged. The
overall React throughput goal remains unfulfilled.

## Hypothesis and implementation

The previous structural-stack experiment did not remove recursion between compiled
component writers. This experiment does: a lazy synchronous work record defers
renderProgramWriter, and an explicit depth-first stack evaluates child work and
success/failure/cleanup continuations. Existing generated pending branches save
their compiler frames and resume through that stack. Native promises remain the
representation of asynchronous work. A synchronous stack record alone does not
trigger the sink's await flush. Existing head flushes remain in the writer.

The hypothesis was that removing nested writer calls might reduce the HTTP-only
overhead seen in earlier traces. The countervailing cost is materializing state
that otherwise stays in synchronous calls. No estimated percentage was established.

The scratch builder adapts 45 pending checks and 61 then/finally call sites in each
artifact. A control artifact has those same adapters but still executes writers
directly. This separates adapter overhead from the added stack scheduling. The
public string/stream renderer, tree, output sinks, hydration and ownership paths
are shared throughout. The prototype is not a new HTML renderer.

The refinement statically identifies 14 leaf and 11 branching writer definitions
in each artifact. Leaf means no generated child, keyedChild, component or
directComponent call. A module-time function flag allows leaf execution directly;
branching writers use the same stack. This is a scratch representation, not an
accepted compiler ABI. It adds no per-request WeakSet.

## Validation and boundaries

Each variant passes 16 full-document comparisons on Node and 16 using the native
Bun entry point, including strings, streams, assets, changed content and a missing
route. Each passes 12 pressure/failure comparisons on each runtime using the
portable entry: every nonempty write introduces a real pending drain; selected
drains reject. HTML, errors and write ordering match the current artifact.

Seven evaluator checks per runtime cover a 30,000-link synchronous chain, failure
recovery, finally behavior, native promise settlement and pending cleanup. The
first evaluator check invocation passed a thenable directly to Node assert.rejects,
which requires a native promise or function. The harness was corrected to pass an
async function; no runtime change was needed.

These are focused prototype checks, not production acceptance. Pending component
task cancellation, all enhancement captures, browser hydration and full package /
compiler validation have not been completed for these rejected variants. Do not
infer those guarantees from the fixture checks. The existing early-head code is
retained, but browser head-discovery timing was not remeasured.

## Focused render timings

All numbers below are microseconds per complete document, lower is better. Every
population uses a fresh process, production mode, below-normal priority, 10,000
warmups and 5,000 measured renders. Two opposite implementation orders are shown
as arithmetic means. The standard assets fixture has three incidents; large has
96. All eXact hashes match, including complete app-owned documents and hydration.
Stream timings consume the entire stream. These are not HTTP RPS or native Bun
adapter throughput. The same portable entry is used for runtime timing comparisons.
No build, test or profiler ran concurrently with these timings. User PC load can
vary, so avoid comparisons with earlier dates or interpreting small differences.

Initial 64-process experiment (control is adapters without stack scheduling):

| Runtime / mode / fixture | current | control | candidate | react |
| --- | ---: | ---: | ---: | ---: |
| Node / string / assets | 27.14 | 28.52 | 34.75 | 21.65 |
| Node / string / large | 132.01 | 143.71 | 178.04 | 130.24 |
| Node / stream / assets | 46.64 | 50.45 | 54.17 | 62.93 |
| Node / stream / large | 167.76 | 178.61 | 219.25 | 372.76 |
| Bun / string / assets | 40.10 | 40.93 | 44.59 | 32.95 |
| Bun / string / large | 206.62 | 225.65 | 311.91 | 183.55 |
| Bun / stream / assets | 54.13 | 54.54 | 63.81 | 52.73 |
| Bun / stream / large | 268.26 | 289.79 | 352.55 | 273.66 |

The initial candidate is slower in every grouped comparison. The control also
costs time, so the full regression cannot be attributed solely to stack dispatch.

The leaf refinement was tested in 24 additional string-render populations:

| Runtime / mode / fixture | current | candidate | react |
| --- | ---: | ---: | ---: |
| Node / string / assets | 26.91 | 32.44 | 21.89 |
| Node / string / large | 131.86 | 165.04 | 133.74 |
| Bun / string / assets | 39.03 | 41.57 | 33.38 |
| Bun / string / large | 202.01 | 250.47 | 180.50 |

It reduces the observed overhead relative to the initial experiment, but remains
slower than its paired current build in all eight individual string comparisons.
These two experiments occurred at different times; their cross-experiment timing
difference is not a paired estimate of the refinement's gain. No additional
isolated streaming run was justified before the HTTP check.

## What the stack changes

Untimed source counters record these counts per full string render:

| Fixture / variant | Writer calls | Maximum nested writer calls | Continuation records | Saved compiler frames |
| --- | ---: | ---: | ---: | ---: |
| assets / conditional-emission | 24 | 7 | 0 | 0 |
| assets / writer-trampoline | 24 | 1 | 221 | 15 |
| assets / writer-trampoline-leaf | 24 | 2 | 109 | 8 |
| large / conditional-emission | 210 | 7 | 0 | 0 |
| large / writer-trampoline | 210 | 1 | 1430 | 108 |
| large / writer-trampoline-leaf | 210 | 2 | 574 | 8 |

The initial stack reduces nested writer calls from seven to one. The refined
stack permits one terminal leaf call, with maximum nesting of two. Thus the
experiment actually reaches compiled writers, unlike the structural-only stack.
The refinement reduces the large fixture's continuation records from 1,430 to 574
and saved compiler frames from 108 to eight, but this is still extra work compared
with the current synchronous path. Counts describe executed explicit construction
sites, not allocated heap bytes, GC frequency or retained memory. The evaluator
also has its stack array, and generated closures are not counted in these totals.

This evidence implicates the continuation-heavy implementation's overhead. It
does not prove that every possible compiler-native explicit stack must be slower.
A future variant would need to avoid lifting the existing promise-style cleanup
and mapping chains into separately allocated records, rather than repeating this
same conversion or merely replacing its frame container.

## Actual Node HTTP comparison

The refined stack was tested under HTTP despite its slower render loops, because
the proposed benefit concerned work under request load. Six fresh workers run
current / refined stack / React and the reverse order. Each receives ten seconds
of HTTP warmup, then five measured seconds using two separate drivers with
concurrency 16 each. Before/after render loops and invocation telemetry are shared
with the existing diagnostic worker. These loops are outside the measured stage.
Production Node 26.8.1, the existing Node adapters and full document shells are
retained. This is a focused diagnostic, not a replacement full benchmark baseline.

| Order | Current eXact RPS | Refined stack RPS | React RPS |
| --- | ---: | ---: | ---: |
| Forward | 8,289 | 7,482 | 10,793 |
| Reverse | 8,443 | 6,810 | 10,806 |
| Mean | 8,366 | 7,146 | 10,799 |

The refined stack is slower in both orders. Its mean is
14.6% below current eXact. Current
eXact remains 22.5% below React in this
capture. The measured stages contain 263,334 valid responses and zero errors,
excluding warmups and preflights. Both eXact artifacts return the same 4,672-byte
document; React returns its complete 3,660-byte document. Worker, artifact and
adapter checks complete successfully. All owned processes exit; only the user's
Codex Node remains.

No HTTP result is claimed for the initial all-writer stack or for native Bun.
Reject both variants, retain their evidence, and keep the current renderer. The
stack investigation has advanced beyond structural recursion, but it has not
closed the HTTP gap. Further work should target a measured repeated operation or
representation cost without introducing these continuation allocations.

The adjacent evidence archive contains the builders, runtime prototype, artifacts,
checks, counting harness, raw render/HTTP measurements, fixture, runner ownership
helpers, this report and a verified SHA-256 manifest. It is diagnostic evidence,
not a complete standalone distribution of every external dependency.
