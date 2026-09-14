# Node string HTTP gap attribution

This is a diagnostic profile of the unchanged retained framework and React builds.
No optimization candidate or new maximum-throughput benchmark ran. The conditional
fragment prototype remains paused after its earlier output checks. This capture
follows the [results interpretation](ssr-results-interpretation-2026-09-10.md).

## Capture and boundaries

Four fresh Node 26.8.1 production workers run Exact/React, then React/Exact. Each
warms for ten seconds at concurrency 32 and is profiled for ten seconds at 3,000
offered requests/s. Two drivers each offer 1,500 requests/s. All owned processes
run below normal priority, one workload at a time, while PC use may vary.

The worker is regenerated from current source with profiler-only control routes.
Sampling is requested at 250 microseconds. Profile startup resets existing
telemetry but does not force GC. Current server and adapter artifact identities
are captured and checked after execution. Full authored documents contain the
application tree, hydration, and four asset tags. Exact is 4,672 bytes and React
3,660 bytes. Every completed response matches its framework's expected full hash.

There are 119,964 valid measured responses, zero response errors, and 36
offered requests missed by driver scheduling. These are misses, not failed server
responses. No warmup requests are included in that total.

Profiling changes execution costs. Neither the process CPU figures nor phase
intervals below are ordinary uninstrumented render timings. The profile is also
below saturation, so it does not prove the distribution at maximum throughput.

## Render, response, and GC

Mean elapsed intervals in microseconds:

| Interval | Exact | React |
| --- | ---: | ---: |
| Render interval | 81.63 | 59.30 |
| Request entry to first write | 92.41 | 71.26 |
| Participant entry to response finish | 135.89 | 111.85 |

These are overlapping intervals, not disjoint CPU stages. Existing phase counters
also include a few control requests, approximately two per 30,000 load requests.
The approximate render-to-first-write difference is 10.8 microseconds for Exact
and 12.0 for React. Most of the approximately 24-microsecond participant-completion
gap is already present in the render interval, about 22 microseconds.

Process CPU per valid request is 211.32 microseconds for Exact
and 160.17 for React. This includes all worker threads and
profiler/control overhead; it cannot be allocated precisely by JavaScript stack
samples or compared directly with ordinary render timings.

GC observer duration totals are 3.33 microseconds per valid
request for Exact and 1.14 for React. Exact records
211 collections across its two populations and React 388.
React collects more often but spends less observed total time in collections.
The roughly 2.2-microsecond GC-duration difference is much smaller than the render
interval gap. GC event duration is not process GC CPU time, and this comparison
does not rule out allocation costs in the mutator, barriers, or object access.

## Stack attribution

The analyzer classifies each sample by its nearest recognized source operation.
Active means non-idle samples. It reports both sample counts and sampled wall
intervals, and records intervals longer than five milliseconds separately. Long
intervals are not silently dropped. Counts are emphasized here because assigning
a long scheduling delay to one sampled frame can distort wall-time attribution.
Counts still are statistical samples, not invocation counts or precise CPU time.

Samples per 10,000 completed requests, pooled within each framework:

| Broad source group | Exact | React |
| --- | ---: | ---: |
| Rendering, application preparation, serialization, and result assembly | 1,536 | 1,017 |
| HTTP input | 315 | 306 |
| HTTP output | 711 | 695 |
| GC | 75 | 27 |
| Explicit response adapter | 38 | included in other groups |

React application serialization is included with rendering, so the broad row
does not misleadingly compare Exact's separate hydration group with only React's
HTML renderer. Classification is still source-based and cannot make differing
framework operations perfectly symmetric. The output row is close in this load
regime despite different Node framing paths, writeUtf8String versus writev.

Exact's active-sample distribution includes 15.65% program execution/traversal,
10.47% hydration, 8.41% application/asset preparation, 8.19% component preparation
and ownership, 6.13% result assembly, and 1.98% escaping/accounting. These groups
are disjoint under the analyzer's precedence rules.

Direct self samples provide more narrowly attributable sites:

- `serializeJson`: about 5.54% of Exact active samples.
- `scriptSources`: about 2.59%.
- `validatePositionalValue`: about 2.68%.
- `startsExactDocument`: about 2.08%.
- `createChunkedHydratableResult`: about 2.08%.
- `createPreparedServerRenderProgram`: about 1.25%.
- `renderProgramWriter`: about 0.59%.

These are self samples, not inclusive cost or a guaranteed saving if a function
disappears. Array construction can be charged to its caller; GC is separate;
inlining and sampling affect attribution. Nonetheless the constructor and writer
entry sites do not by themselves justify expecting a large Node string gain.

## Interpretation and next decision

The new evidence supports prioritizing rendering and state publication over
response adapter rewrites. It also weakens a GC-only explanation. The render gap
appears in both fresh populations, with Exact render intervals near 81-82
microseconds and React near 59. This capture does not explain why isolated ready
loops differ from HTTP execution or establish an instruction-cache/JIT mechanism.

The frame representation experiment removed arrays without removing most of the
work in these larger groups. Its ambiguous Node result is therefore unsurprising,
but the profile does not prove its candidate-specific benefit or regression cause.
It profiles current Exact and React, not the frame candidate.

Do not resume the three-program fusion benchmark solely because it removes three
wrappers and writer objects. A broader compiled-root design needs an explicit
cost model for the setup, traversal, and publication it removes. Result assembly
and hydration are also material. Earlier native-prefix, preserved-tail, result
wrapper, and hydration-escape experiments must be reviewed before proposing the
same changes again. A hot source line identifies a cost; it does not validate a
particular replacement.

The current result path recognizes the completed document, finds its body-close
position, and constructs the hydrated result. The compiler and renderer already
know document structure while writing. That is an architectural opportunity to
evaluate alongside composed execution, but the earlier preserved-tail experiment
did not establish a Node throughput gain. Any renewed proposal must explain what
additional work it eliminates and what replacement overhead it avoids.

No runtime, compiler, adapter, or public API was changed by this investigation.
No package/browser validation is claimed. All owned profile workers, services,
and load drivers have exited. The overall four-workload React goal remains unmet.

## Evidence

`http-gap-attribution-2026-09-10-evidence.zip` preserves fresh worker/runner sources,
both profiles per framework, raw load and telemetry results, source attribution,
artifact identities, analysis scripts, and a verified SHA-256 manifest. Reproduction
uses the repository's installed dependencies. Existing result archives are intact.
