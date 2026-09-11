# Publication and response assembly timing, September 10, 2026

Status: sampled diagnostic, no production changes.

## Hypothesis and method

Reusing a hydration script could reduce downstream string assembly costs in
addition to skipping publication. This probe times the publication wrapper,
hydratable result factory, and final htmlWithHydration getter separately, using
the ordinary implementation and the prior fixed-input cached-script diagnostic.

The cache is unsafe for changing request data and remains diagnostic-only.
Neither implementation caches the complete document. All component rendering
and final response consumption still run.

Twelve fresh production processes cover normal uninstrumented, normal sampled,
and cached sampled artifacts in forward/reverse order on Node 26.8.1 and Bun
1.4.2. Each warms 50,000 complete encoded renders, enables sampling, warms 2,000
more, resets counters, and measures 20,000 renders. Every 32nd call to each stage
is timed into a preallocated array. There are 1,250 samples per stage, variant,
and runtime. Workers execute sequentially at below-normal priority while the
user uses the PC. The portable Node artifact is used on both runtimes.

The document has three incidents, a complete application-owned shell, and four
asset tags. All twelve final document hashes match. These are in-process
encoded-string renders, not HTTP throughput or native Bun adapter results.

## Mean sampled elapsed microseconds

| Runtime | Variant | Publication | Result assembly | Final join |
| --- | --- | ---: | ---: | ---: |
| v26.8.1 | sampled | 5.989 | 3.934 | 1.226 |
| v26.8.1 | cached | 0.292 | 3.592 | 1.163 |
| 1.4.2 | sampled | 5.358 | 3.252 | 1.545 |
| 1.4.2 | cached | 0.097 | 3.579 | 0.842 |

Assembly includes document recognition, closing-body lookup, chunk slicing,
hydration insertion, and result object/accessor construction. The final getter
joins and caches the complete HTML. Response encoding, transport, and later
garbage collection are not included in those stage timers.

Mean complete-render elapsed time was 43.91 microseconds uninstrumented versus
47.52 sampled on Node, and 34.82 versus 36.25 on Bun. Thus instrumentation plus
population variation is material, about 8.2% and 4.1% respectively. The cached
sampled means were 38.02 and 30.56 microseconds. These populations cannot isolate
instrumentation overhead from workload variation or changed JIT decisions.

All phase values include timer, branching, and measurement storage effects,
preemption, and any coincident GC. They are not CPU attribution or recoverable
performance budgets. The final-join means have long tails: ordinary medians are
0.70 microseconds on Node and 0.80 on Bun. No confidence interval is claimed.

## Interpretation

Result assembly is a material separately measured stage. Cached script reuse
does not consistently lower its cost: Node's mean decreases modestly while Bun's
increases. Final-join means decrease on both, but this is insufficient evidence
to attribute the earlier HTTP bypass gain primarily to string reuse.

The measurements support inspecting result construction and document assembly
directly. They do not support removing hydration validation or integrating the
cached-script implementation. Previous boundary-checkpoint and shared-getter
experiments must be consulted before repeating those changes.

No production tests or browser suites were rerun for this diagnostic-only
instrumentation. The broader Node/Bun string/stream React objective remains
unmet. The evidence archive preserves all scripts, artifacts, raw samples,
summary, fixture, and SHA-256 manifest.
