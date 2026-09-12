# Client V8 allocation optimizations, September 11, 2026

This follow-up integrates four eXact client allocation improvements identified by the
[initial client audit](client-v8-2026-09-11.md). It examines eXact only. React code and
artifacts were not changed or analyzed in this follow-up. Public benchmark charts remain
the last full-suite capture; these focused measurements do not replace navigation or paint results.

## Retained changes

1. Proxy reads use the existing path-specific `proxyRefs` entry directly. The duplicate
   `WeakMap<object, Set<ReactiveRef>>` held exactly one source per proxy and recreated its Set
   on repeated child access. Retained aliases remain independent; collection moves migrate
   the proxy's parent reference as before.
2. Structural equality returns immediately for identical raw values and allocates its two
   cycle/alias maps only when comparing distinct objects. Unwrap order, property descriptors,
   sparse arrays, cycles, alias topology, and opaque operation identity retain their semantics.
3. Mounted-tree teardown uses a stack of mounts with completion markers instead of allocating
   entry and exit records for each node. Scope stopping still precedes descendant traversal;
   resource release follows descendants in sibling order. Cleanup failures still allow later cleanup.
4. A tracking pass allocates its dependency Set on the first observed read. Static executions
   never need that Set. Existing membership retention, unread-branch suppression, nested passes,
   disposal, exceptional exits, and observer transitions remain intact.

These are internal storage changes, with no public API, compiler helper, hydration format, or ABI
change. No application-author documentation or package usage guides require a behavior update.

## Hypotheses and evidence

The first two changes were screened separately in the initial audit. Their expected benefit was
lower allocation, especially during selection, rather than a large reduction in execution time.
The teardown experiment targeted filtering, which mounts and removes rows; selection does not
unmount rows. Its incremental effect was small: approximately 37,909 to 37,701 sampled bytes per
filter update in the corrected comparison. Timing did not establish an independent teardown win.

Instrumenting dependency cardinality before the last experiment found zero reads in 800 of 2,800
filter tracking passes and 400 of 1,000 selection tracking passes. Avoiding empty Sets was expected
to save hundreds of bytes per update, with little timing change. The incremental comparison measured
37,820 to 37,235 bytes for filtering and 40,284 to 40,038 bytes for selection. This supports retaining
the simpler allocation policy without claiming a substantial speedup from it alone.

## Final focused comparison

Chromium 149.0.7827.55, production eXact application, frozen baseline bundle from commit
`5f6345b8ef4e922c49dffc0d27491de91e1002d8`. The baseline runtime predates that documentation commit.
Each variant ran in a fresh browser context; variant positions rotated across nine timing rounds
and six separate profiling rounds. Timing and profiling were not run concurrently with builds or tests.
The baseline and candidates used the same captured full SSR document, service fixture, and replay
transport. Every variant adopted the document and passed the same DOM assertions.

| Workload        | Baseline mean | Final mean | Baseline allocation |    Final allocation | Allocation reduction |
| --------------- | ------------: | ---------: | ------------------: | ------------------: | -------------------: |
| Filter rows     |     138.50 µs |  136.61 µs | 39,816 bytes/update | 37,235 bytes/update |                 6.5% |
| Select incident |     226.44 µs |  222.11 µs | 46,049 bytes/update | 40,038 bytes/update |                13.1% |

Filtering alternates one and three visible rows, retaining the surviving row's DOM identity.
Selection alternates two incident rows through the production event handler. Each population has
20 warmup updates, then 400 filtering or 100 selection updates. Times cover event dispatch through
the expected DOM mutation, not browser paint or a network navigation. Baseline/final population
medians were 136.5/136.0 µs for filtering and 225.0/222.0 µs for selection.

PC workload can vary. The observed mean timing differences are approximately 1.4% and 1.9%, too
small to promise a general speedup from this capture. All populations, including intermediate-variant
outliers, remain in the evidence. Allocation is the more consistent result across the audit and
integration rounds. Heap sampling used a 1 KiB interval and explicitly included objects collected
by both minor and major GC. These are sampled allocation estimates, not retained heap size or exact
allocation counts. Profiling timings are not substituted for the unprofiled timing results.

## Bytecode verification

The hidden-source-map build's JavaScript was byte-identical to the production asset. Named functions
were mapped back to their emitted eXact sources; anonymous or ambiguous names were not attributed.

| Function            | Baseline bytecode bytes | Final bytecode bytes |
| ------------------- | ----------------------: | -------------------: |
| `trackProxySources` |                     157 |                   36 |
| `unmountMounted`    |                     734 |                  631 |
| `runTracked`        |                     290 |                  284 |
| `structurallyEqual` |                   1,114 |                1,151 |

Equality has more bytecode because of its fast path and deferred initialization checks, but executes
fewer allocations on common paths. Bytecode length alone is not a performance score. The final trace
contained 36 bailout entries during the first filter/selection cycle, including harness work. It
contained none in the second or third cycles, so persistent deoptimization churn was not established.

An initial integration run mistakenly used stale DOM browser output after a TypeScript-only DOM
build. Bytecode still showed the original teardown implementation. That run tested the reactive
changes but did not test teardown. DOM was then compiled with `scripts/compile-exact-package.mjs`,
the application and hidden maps rebuilt, and the bytecode change verified before rerunning timing
and profiling. Initial captures are preserved but excluded from teardown conclusions.

## Validation and remaining limits

- Reactive: 182 tests; core: 263; DOM: 275; hydration: 241. All passed.
- Regression coverage protects moved proxy parent paths, equality unwrap order, cyclic/aliased
  values, getter nonexecution, and descendant/sibling cleanup order after failure.
- Repository test typechecking and platform-boundary checks passed.
- Package-content checks, focused lint, and formatting checks passed. The package-content
  script was invoked with `npm_execpath` set to the installed npm CLI after its direct Windows
  `npm.cmd` spawn failed; no packaging code was changed.
- All seven live eXact controlled-service browser tests passed, covering SSR/hydration, optimistic
  success and recovery, comments/tasks, focus retention, transport failures, and reconnect.
- The compiled 1,000-row rotation guard passed: 5.23 ms median, 5.79 ms p95 over five isolated processes.

The larger remaining allocation sources include dependency membership construction, scope ownership,
and mounting/adopting new rows. This round does not justify removing their lifecycle or snapshot
guarantees. A larger list workload and cold hydration measurements would be separate experiments;
these results do not establish their performance or claim all client optimization work is exhausted.

The [machine-readable summary](client-v8-optimization-2026-09-11.json) contains artifact hashes,
population results, and the bytecode inventory. Raw captures and diagnostic scripts are preserved
in [the evidence archive](client-v8-optimization-2026-09-11-evidence.zip).
