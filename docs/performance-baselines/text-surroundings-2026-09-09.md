# Compiler-folded text surroundings

Date: 2026-09-09. Retained compiler optimization and refreshed renderer comparison.

The compiler now folds adjacent serialized static markup into the existing prefix/suffix arguments
of a scalar SSR write. It avoids separate static-write and append calls while preserving the root
opening's ownership of its segments. Dynamic values still use the same escaping and marker logic;
static content is charged once by the program and dynamic lengths retain their existing checks.
The client topology and public authoring model are unchanged.

This uses the existing writer signature and runtime operations. No emitted helper was removed and
no ABI epoch change is required. Frozen ABI behavior passes without regenerating fixtures. The
uncompressed comparison server artifact is 600 bytes smaller; the client artifact
remains index-CdIXDKwS.js.

## Hypothesis and observed work

Combining surrounding static output with the scalar write should reduce operation dispatch and
array append bookkeeping in both string and streaming rendering. No numerical gain was
preregistered and no minimum improvement threshold was used.

Untimed instrumentation records the following per complete document, identically on Node and Bun
and in both output modes. The dynamic text-write count is unchanged.

| Document | Static calls before/after | Text calls | Append calls before/after |
| --- | ---: | ---: | ---: |
| Small | 37 / 14 | 19 | 95 / 72 |
| Large | 502 / 14 | 391 | 1118 / 630 |

These are observed calls, not byte-copy, allocation-byte, or CPU-profile estimates. All instrumented
and timed before/after complete-document hashes match. The existing renderer still collects program
segments and subtree strings; this change does not integrate the experimental direct sink traversal.

## Before/after experiment

There are 32 fresh production-mode populations: Node/Bun, string/consumed stream, small/large,
two reversed-order pairs, and previous/current builds. Each performs 5,000 warmups and 12,000
measured renders. The fixtures contain 3 or 96 incidents and two scripts plus two stylesheet links.
The control is scheduled-contract-current, retaining the preceding scheduling optimization.

Positive values mean longer rendering time. These descriptive local pairs do not establish
confidence intervals or HTTP throughput. Large Node string renders improve consistently by about
5%; smaller workloads and some Bun cells remain mixed.

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | -2.64% | +0.31% |
| node | string | large | -4.77% | -4.80% |
| node | stream | small | +3.27% | -2.80% |
| node | stream | large | -3.17% | -2.50% |
| bun | string | small | -0.59% | +0.77% |
| bun | string | large | -5.79% | +0.03% |
| bun | stream | small | -2.64% | -1.41% |
| bun | stream | large | -4.83% | +3.99% |

## Fresh React comparison

The fresh comparison has 48 successful populations: Node/Bun, string/consumed stream, three
scenarios, two reversed-order rounds, and eXact/React. Each again performs 5,000 warmups and 12,000
measured renders. Empty and assets use three incidents; large uses 96 incidents with the same four
assets. Every response is checked for complete document framing, required asset URLs, and stable
full hashes within each framework. The two frameworks own their complete application documents,
including initial client data.

The same Node-target participant entry files run on both runtimes. React's external dependency
resolution is preserved at its original package location: React DOM 19.2.0 selects server.node.js
on Node and server.bun.js on Bun. Both streaming entries use their framework's Web Stream API and
the worker consumes the result with Response.text(). These are renderer timings, not timings of
the runtime-specific HTTP adapters, network throughput, first-byte latency, or browser performance.

The table uses the median of the two process means, in microseconds per complete render. Percentage
differences are rendering-time differences, not requests-per-second differences.

| Runtime | Output | Document | eXact median us | React median us | eXact time difference |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | empty | 28.03 | 20.81 | +34.7% |
| node | string | assets | 35.61 | 22.20 | +60.4% |
| node | string | large | 162.68 | 133.08 | +22.2% |
| node | stream | empty | 44.34 | 60.78 | -27.1% |
| node | stream | assets | 54.85 | 67.27 | -18.5% |
| node | stream | large | 194.69 | 340.69 | -42.9% |
| bun | string | empty | 31.54 | 31.03 | +1.7% |
| bun | string | assets | 36.30 | 32.49 | +11.7% |
| bun | string | large | 230.04 | 191.30 | +20.3% |
| bun | stream | empty | 43.38 | 47.60 | -8.9% |
| bun | stream | assets | 50.36 | 52.36 | -3.8% |
| bun | stream | large | 280.29 | 265.56 | +5.5% |

eXact wins every tested Node streaming pair and both smaller Bun streaming scenarios. React wins
the string-rendering pairs and large Bun streaming pairs. Overall React parity remains unmet.

The first attempted comparison copied React's externally linked bundle into the scratch directory.
That changed package resolution from the participant's React DOM 19.2.0 to the workspace root's
18.3.1 and failed before React rendered. The single eXact population from that incomplete pair is
preserved separately and excluded from the comparison. The corrected run executes React from its
original directory and records dependency resolution in every React row. The archived scratch
copy of the React artifact is evidence only; it is not a runnable replacement location for that
externally linked bundle. No completed paired population was discarded.

## Validation

Native compiler and exactc tests pass, and the compiler binary was rebuilt with an updated build
stamp. Four preexisting compiler assertions initially depended on the spelling of trailing
arguments or a separate static call. They were adjusted to retain their actual checks: markerless
scalar writes and eager issue of independent task siblings. The initial failing JSONL is archived;
the later native test/build passed. A new compiler test verifies folded markup around text and
attribute boundaries.

All 258 core tests and 286 SSR tests pass. A new SSR regression checks exact markup and escaping
across text/attribute boundaries and exercises the exact output limit plus one byte below it.
All 56 browser checks pass across eXact/React, Node/Bun, and string/stream, covering hydration and
interactive behavior. These browser checks are correctness tests, not new browser timing results.

Core/SSR builds and compiler lowering, comparison application builds, test typechecking, changed
TypeScript file linting, source architecture, platform boundaries, frozen compiled ABI behavior,
release epoch checks, and package contents pass. Completed-command summaries and the browser logs
are retained; the summary is not a claim that every terminal transcript is included.

The compiler runtime comments and engineering SSR documentation describe serialized surroundings.
No public API, application setup, or documentation-app usage rule changes.

## Remaining work

The shared direct-writer implementation, compiler task-dependent expression deferral, and early
head flushing remain unfinished. This optimization can also reduce writes in that eventual
traversal, but it does not prove its performance or lifecycle behavior. The fresh comparison leaves
string rendering and large Bun streaming as unresolved performance gaps. No full HTTP benchmark
or browser timing baseline was replaced with these focused renderer results.
