# Retained Node string HTTP CPU profile, September 10, 2026

Status: diagnostic evidence, no production change or new capacity benchmark.

The result-consumption candidate remains rejected and the canonical Node build
is the retained 2ebf7fed artifact. This profile targets its remaining gap to React
under actual HTTP traffic, rather than sequential Response consumption.

## Method

Four fresh production processes run eXact/React in both orders. Each warms for
ten seconds at concurrency 32, then samples ten seconds at 3,000 offered
requests/s using two independent drivers. Worker, service, drivers and parent
run at below-normal priority. Only one measurement workload runs at a time;
the PC remains in use. The inspector interval requested is 250 microseconds.

All 119,959 completed responses match their complete document hash and byte
count, with zero response errors. There are 41 scheduling misses, recorded
separately from errors. Documents include the full application-owned shell and
four asset tags. eXact is 4,672 bytes and React is 3,660 bytes; neither is padded.

The profiler worker derives from the current benchmark worker, adding only
start/stop controls and resolving imports to their original modules. No forced
GC occurs in the measured lane. Artifact and adapter directory identities are
checked before and after capture. All owned processes close.

## Sampled stack distribution

Values below are sampled stack residence microseconds per completed request.
Classification uses ancestry and precedence, not separately timed operations.
Sampling intervals can contain descheduling, and profiling perturbs execution.
These are not removable CPU budgets or ordinary throughput measurements.

| Category                            | eXact |                       React |
| ----------------------------------- | ----: | --------------------------: |
| Other rendering and components      | 76.28 |                       65.93 |
| Hydration JSON serialization        |  8.17 | included elsewhere / absent |
| Hydration validation and projection |  4.88 | included elsewhere / absent |
| Other hydration publication         |  0.77 | included elsewhere / absent |
| Response ownership and adapter      |  2.13 | included elsewhere / absent |
| HTTP input and dispatch             | 14.65 |                       11.04 |
| HTTP output and socket              | 40.32 |                       35.61 |
| Garbage collection                  |  4.44 |                        2.22 |
| Benchmark telemetry                 |  8.48 |                        7.36 |

React's Document function includes serialization of initial data and parsing
asset tags, so separate eXact hydration rows are not symmetric measurements of
identical work. Idle, profile controls and miscellaneous harness/runtime work
are excluded from this displayed subset, but retained in raw analysis.

The two eXact process CPU observations are about 218.85 and 218.20 microseconds
per request; React's are 176.10 and 177.18. These include instrumentation and
must not be substituted for the prior unprofiled throughput results.

## Findings and next action

Rendering plus hydration is the largest excess; directly attributed response
ownership/adapter work is comparatively small. The eXact serialization leaf is
7.71-8.64 sampled microseconds/request, positional validation 3.58-4.01,
scriptSources 4.36-4.44, and document-prefix recognition 3.01-3.30. Previous
serialization, result-wrapper and document-boundary experiments remain relevant;
this profile does not make their rejected alternatives wins.

Source inspection identifies a concrete list-preparation difference in the
application head. eXact's scriptSources and stylesheetSources first materialize
URL arrays, which authored map expressions then turn into elements. React maps
regex matches directly to elements in Array.from callbacks. Both parse the asset
tags and render their shells. The difference is not a missing shell or static
HTML substitution.

The next compiler audit should trace this intermediate list work and determine
whether the compiler can eliminate it while preserving evaluation order, key
identity and task/sink suspension. Do not simply rewrite supported application
code to conceal a framework limitation, introduce cross-request caches, or claim
that all time sampled in scriptSources is recoverable.

No source, artifact, API, ABI, package or browser behavior changed in this capture.
The evidence archive includes worker preparation, runners, raw profiles/load
results, analysis, framework entry artifacts and document source, with a verified
SHA-256 manifest. The overall performance goal remains unmet.
