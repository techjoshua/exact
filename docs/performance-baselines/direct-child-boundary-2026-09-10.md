# Direct child arguments and GC survival, September 10, 2026

Status: bundle experiment complete, candidate unadopted. Production source and canonical applications remain unchanged. The next investigation is object survival and promotion, rather than another allocation-count-only change.

## Boundary experiment

Hypothesis: passing the existing render function and its child value through writeProgramBoundary removes the per-child wrapper closure, reducing allocations without a cache. The same boundary implementation still waits for opening pressure, renders the child, flushes before suspension, and closes after child completion. An asserted transformation of the retained application adds the value argument to writeProgramBoundary/renderBoundary and replaces the child wrapper with output.render plus value. This internal experiment is not an accepted source or compiler ABI change.

Sixteen fresh production processes use Node/Bun string rendering, three-incident and 96-incident full application-owned documents, four asset tags, 50,000 warmup renders and 20,000 measured renders, in two reversed orders. Whole-document hashes match between candidate and control. No profiling occurs during the initial timing screen.

| Runtime | Fixture      | Retained microseconds/render | Candidate microseconds/render |
| ------- | ------------ | ---------------------------: | ----------------------------: |
| Node    | 3 incidents  |                        25.45 |                         25.68 |
| Node    | 96 incidents |                       168.77 |                        174.43 |
| Bun     | 3 incidents  |                        28.61 |                         27.09 |
| Bun     | 96 incidents |                       229.31 |                        225.30 |

Node large has one essentially tied pair and one slower candidate pair; Bun improves in both orders. The candidate needs stronger evidence before acceptance, including shared-sink and browser validation. Those acceptance checks were not run for this bundle-only experiment.

Separate Node allocation sampling uses 50,000 warmup and 10,000 measured renders, a 16,384-byte sampling interval, and includes objects collected by both minor and major GC. Estimated allocation falls from 73.66 to 70.67 decimal kB/render on the small fixture and from 545.81 to 528.82 on the large fixture. These are one-population diagnostic estimates, not retained heap or exact object counts.

## GC event follow-up

Twelve fresh Node processes compare retained, candidate and React in two reversed orders for both fixtures. Each warms 50,000 renders and measures 20,000. PerformanceObserver records GC events with start times within the measurement interval; records are delivered after measurement. These durations describe GC event elapsed time, not sampled process CPU time. Timing and GC event capture run separately from heap sampling.

| Fixture      | Variant   | Microseconds/render | Mean GC events per 20,000 renders | Mean GC duration, ms |
| ------------ | --------- | ------------------: | --------------------------------: | -------------------: |
| 3 incidents  | Retained  |               25.47 |                                57 |                56.48 |
| 3 incidents  | Candidate |               25.36 |                              54.5 |                54.99 |
| 3 incidents  | React     |               21.53 |                                94 |                 9.91 |
| 96 incidents | Retained  |              170.42 |                               422 |               323.64 |
| 96 incidents | Candidate |              171.21 |                             409.5 |               350.09 |
| 96 incidents | React     |              133.55 |                               274 |                55.18 |

The allocation reduction does not consistently reduce GC duration or total render time. Current eXact small runs have fewer but much more expensive collections than React. eXact includes minor, major and incremental events; React records only minor events in these captures. The Node large timing orders again disagree on the candidate's direction. No new HTTP or streaming comparison is inferred.

## V8 survival trace

A separate diagnostic capture runs retained eXact and React with --trace-gc-nvp, using the same warmup and measured iteration counts for both fixtures. Node 26 emits JSON GC records, so the initial legacy key/value parser reported zero events. The corrected analyzer reads the saved JSON records; no capture was rerun. Application measurement markers can interleave with V8's output, so only complete GC records strictly between those markers are counted. Boundary records may be excluded. These are representative interior-event totals, not exact full-interval accounting, and trace-instrumented timings are not benchmark capacity results.

| Fixture      | Framework | Recorded minor GCs | Promoted during minor GC, decimal MB | New-space survived bytes summed across minor GCs, decimal MB |
| ------------ | --------- | -----------------: | -----------------------------------: | -----------------------------------------------------------: |
| 3 incidents  | eXact     |                 50 |                               216.04 |                                                       231.39 |
| 3 incidents  | React     |                 94 |                               0.0355 |                                                         4.32 |
| 96 incidents | eXact     |                375 |                              1400.83 |                                                      1522.07 |
| 96 incidents | React     |                274 |                               0.0355 |                                                        76.04 |

The small eXact trace uses 32 MiB new-space capacity versus React's 16 MiB; both large traces use 32 MiB. eXact also has three recorded major collections on small and 23 on large, while React has none within these recorded intervals. Survived-byte sums can count the same object across collections and are not unique retained bytes. Promotion is not evidence of a leak. These observations identify a concrete next question: which eXact allocations remain reachable across collections and drive promotion? Reducing raw allocated bytes alone does not answer it.

No production change, API/ABI change, or frozen fixture regeneration occurred. The overall performance objective remains unmet. Evidence: `direct-child-boundary-2026-09-10-evidence.zip` contains the bundle candidate, construction and measurement scripts, allocation profiles, GC event captures, raw V8 logs, and corrected trace analyzer.
