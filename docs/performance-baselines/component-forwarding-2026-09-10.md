# Shared component forwarding callbacks

Status: retained for its measured allocation reduction and modest Bun string
benefit, with functional validation complete. HTTP follow-up is complete, but
does not establish a general throughput improvement. This is not an identified
fix for the dominant HTTP slowdown; the React comparison goal remains open.

## Change and hypothesis

Earlier target-forwarding changes removed closures around prepared programs and
direct component content. component.ts still constructed two callbacks per
component boundary, capturing context and options already stored on the artifact
execution. The new shared methods use that existing execution as their receiver.
No execution wrapper, WeakSet, cache or second renderer is introduced. Descendants
retain separate executions, selected owners, publication and cleanup. This removes
two explicit closure constructions per component invocation; it does not remove
component work, validation, hydration or lifecycle boundaries.

The pre-experiment expectation was approximately 1 to 3 percent improvement on
component-heavy documents if allocation reduction mattered. The tradeoff is reading
context/options through the execution instead of closure captures. Fewer source
allocations do not, on their own, establish fewer heap bytes or faster requests.

The source change is in render/component.ts. The internal artifact-execution type
now requires its receiver explicitly for child-forwarding methods, protecting
against accidental detached calls. Engineering documentation describes that
ownership. No public API, compiler helper signature or ABI semantics changed;
public application documentation needs no change for this internal implementation.

## Prototype evidence

The scratch builder changes exactly two callback arguments at the component
boundary in both Node and native Bun artifacts. Each variant matches 16 complete
documents per runtime, including string/stream output, dynamic assets, changed
content and missing routes. Twelve forced-pressure/failure checks per runtime
match writes, outputs and failures. No validation is bypassed.

Twenty-four fresh-process string timing populations use 50,000 warmups and 20,000
measured renders, two opposite implementation orders, three/96 incidents and
production Node 26.8.1/Bun 1.4.2. Node is essentially flat in the aggregate. Bun
improves in all four individual comparisons: means 28.32 to 27.27 microseconds for
the standard fixture and 214.72 to 211.23 for the large fixture. Full document
hashes match. These portable render timings are not HTTP RPS.

The first HTTP screen uses original workers and native runtime adapters. For each
runtime/mode, current, prototype and React workers warm for ten seconds apiece,
then execute six rotated orders of 1.5-second measurement blocks. Two separate
drivers use concurrency 16 each. Processes run below normal priority; no build,
test or profiler runs concurrently. Exact responses must match completely.

| Runtime / mode | Previous RPS | Prototype RPS | React RPS |
| -------------- | -----------: | ------------: | --------: |
| node / string  |        8,405 |        10,378 |    13,604 |
| node / stream  |        6,918 |         7,294 |     5,034 |
| bun / string   |       10,493 |        10,715 |    11,279 |
| bun / stream   |        8,396 |         8,338 |     8,557 |

This screen has 987,205 valid measured responses and zero errors. Its apparent
23.5 percent Node string gain is not accepted as a causal estimate: a fresh-worker
replica check fails to reproduce it.

That follow-up runs two independent workers per implementation in each of two
populations, reversing implementation startup assignments. Each worker receives
100,000 validated warmup requests and eight balanced 1.5-second blocks. It uses
the original Node worker and the same component-generated complete document.

| Population | Previous RPS | Prototype RPS | Change |
| ---------- | -----------: | ------------: | -----: |
| 1          |        9,152 |         9,108 | -0.48% |
| 2          |        9,197 |         9,346 | +1.62% |

The replica capture has 885,462 valid measured responses and zero errors, excluding
800,000 warmup requests and preflights. Two identical previous-build workers in
the first population average 8,061 and 10,242 RPS. This large worker variation
prevents treating the first screen's implementation difference as an improvement.
The combined label in raw replica rows refers to this forwarding prototype, as
identified by its artifact paths and hashes.

## Integrated validation and measurements

The source implementation is rebuilt through the SSR TypeScript package and the
comparison application's client, Node SSR and native Bun SSR targets. Both rebuilt
entries pass the same 16-document and 12-pressure checks per runtime. All 372 SSR
tests across 60 files pass. All 56 comparison browser checks pass across Node/Bun
and string/stream modes. Targeted ESLint and formatting, source architecture,
JSDoc, explicit-any, compiled ABI, frozen release ABI, platform boundary and package
contents checks pass.

The documentation formatter flag was line-ending normalization; applying the
formatted UTF-8 output did not rewrite its prose. The first direct package-content
command failed with Windows spawn EINVAL when attempting npm.cmd. Supplying the
installed npm CLI through the script's supported npm_execpath environment allowed
the check to complete. No package-content defect was reported and the check was
not bypassed. The explicit receiver type was added after the runtime test run;
it changes no emitted behavior and the subsequent package build succeeds.

Twenty-four further fresh-process string timing populations use the same long
warmup and measurement counts against the frozen previous artifact and React.
Mean microseconds per complete document, lower is better:

| Runtime / fixture | Previous | Rebuilt candidate |  React |
| ----------------- | -------: | ----------------: | -----: |
| node / assets     |    21.81 |             22.16 |  21.33 |
| node / large      |   130.34 |            132.38 | 132.47 |
| bun / assets      |    27.59 |             27.18 |  32.68 |
| bun / large       |   216.77 |            214.18 | 211.31 |

The rebuilt Bun candidate improves in all four pairs, more modestly than the
prototype. Node's standard result is close; the large result is mixed, with one
approximately 3 percent regression and one effectively flat pair. These data do
not justify claiming a universal render-speed improvement. All artifact hashes
and complete-document identities are checked. No claim is made that the earlier
HTTP prototype numbers are measurements of this rebuilt artifact.

Eight separate Node heap-sampling populations compare previous and rebuilt code
in both orders for the standard and large fixtures. Each warms 50,000 renders and
samples 10,000, with a 16 KiB sampling interval and collected minor/major-GC objects
included. Full document hashes match. The sampling-based allocation estimates are:

| Fixture | Previous bytes/render | Rebuilt candidate | Change |
| ------- | --------------------: | ----------------: | -----: |
| small   |                67,940 |            66,610 | -1.96% |
| large   |               499,457 |           486,775 | -2.54% |

Both pairs reduce sampled allocation in each fixture. These are estimates of
allocated bytes, not exact allocation counts, retained heap or measured GC pause
improvements. Sampling overhead makes these unsuitable as render/HTTP timings.

## Current decision and remaining work

The subsequent [same-worker callback comparison](component-callback-toggle-2026-09-10.md)
does not reproduce the separate-worker double-digit Node regression. Fresh
closures lead by 0.75, 1.31 and 1.37 percent in three pairs, then trail by 6.61
percent in the fourth. All 432,023 measured responses are correct. Small Node
tradeoffs remain possible; the fourth pair is not a reason to claim shared
callbacks improve throughput. Taken with the earlier replica results, allocation
reduction, Bun string evidence and completed functional coverage, retain the
shared implementation as an allocation improvement. Stop treating its initial
large HTTP screen as a causal speedup or regression.

The following paragraphs preserve the earlier provisional decision chronology.

Follow-up: the rebuilt HTTP screen is now complete. Its results and the unresolved
Node regression signals are recorded in the
[hydration-stage substitution report](hydration-stage-substitution-2026-09-10.md#previous-shared-callback-http-confirmation).
The decision below describes the status before that screen; the implementation
remains provisional.

Keep the integrated implementation available for rebuilt HTTP confirmation. It
has a measured allocation reduction and consistent modest Bun string-render gains,
with functional, lifecycle and browser coverage passing. The Node large-string
timing tradeoff and native Bun stream screen remain explicit concerns; neither is
hidden behind a minimum-improvement threshold. Do not call the change a resolved
HTTP bottleneck or claim the first screen's 23.5 percent gain.

The actual HTTP gap remains unexplained in its dominant part. Earlier pathname
copying establishes a small JSON representation contribution, while replica
variation is a separate measurement problem. Stack conversion and payload-size
equalization do not explain the dominant gap. Further work must distinguish those
facts from a claim to have found its root cause.

Current rebuilt Node artifact SHA-256: `6882479fc08ae551f88751a2395f44491f98e5a10f871476f5b520b5ce61e6f3`.
Current rebuilt Bun artifact SHA-256: `dd19c05d17230014eb983e0291312c8115cb6ff7f7defb2b7de13b194bbbf4c6`.

The adjacent archive includes scripts, frozen previous/prototype/rebuilt artifacts,
fixture, raw timings and HTTP replicas, warmup records, allocation profiles, source
files, validation logs, this report and a verified SHA-256 inventory. Workspace
dependencies are not reproduced as a complete standalone distribution.
