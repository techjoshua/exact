# Native SSR positional projection, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

The native compiler and SSR runtime now retain selective generated hydration projection. The
four-population HTTP confirmation improves the 96-row workload by 2.1% with normal requests and
1.8% with preloaded data. Comment-heavy preloaded throughput improves by 4.4%; normal throughput
there is essentially unchanged. This is a workload-specific optimization with a server code and
memory cost, not a universal throughput improvement or a demonstrated lead over React.

The raw evidence (local capture: `ssr-native-projection-2026-09-06.json`) contains individual samples, frozen
artifact identities, native implementation sources, benchmark runners, cold-process measurements,
and differential checks. It follows the earlier
[isolated projection study](ssr-projection-study-2026-09-06.md).

## Actual compiler output

The native compiler emits optional version-one projectors for finite object schemas used as array
elements with at least four fields. These functions use fixed property reads, preserve validation
and conversion order, and register against immutable schema identity at module evaluation. The
actual comparison bundle contains five functions. The earlier selective prototype deduplicated
the finished bundle into two functions; its smaller code and heap costs did not carry over.

The runtime selects a supported projector once for arrays of at least sixteen elements. A separate
loop handles projected records; the ordinary loop handles short arrays, unregistered schemas, and
diagnostic traversal. Unknown projector versions use the interpreter. The compiler and runtime
thresholds are heuristics, not claimed optimal values.

Serialization tuples, HTML, hydration bytes, and the browser decoder remain unchanged. The generated
functions still enforce depth and node budgets, prototype checks, exact key counts, live own-property
checks, active-path cycle tracking, and validation of generic leaves. The runtime supplies `Object`
and `Array` intrinsics as callback arguments to prevent lexical capture by authored bindings.

This introduces the additive internal export `@exactjs/ssr/runtime/positional-projection` and its
versioned registration contract. Previously compiled components need no regeneration. The
compatibility guarantee is older components on the updated runtime; newly emitted imports require
the matching updated runtime package.

## HTTP confirmation

Each scenario uses four fresh worker populations, twelve balanced 500 ms windows per variant per
lane, concurrency 32, and discarded two-second primes. No builds, tests, or profilers run during
timing. Every response is checked after timing, and baseline/candidate hashes and byte lengths
match. Aggregate RPS divides total requests by total measured elapsed time.

| Workload      | Normal baseline RPS | Normal candidate RPS | Change | Preloaded baseline RPS | Preloaded candidate RPS | Change |
| ------------- | ------------------: | -------------------: | -----: | ---------------------: | ----------------------: | -----: |
| Small         |             2,432.1 |              2,411.9 | -0.83% |                7,811.1 |                 7,865.6 | +0.70% |
| 96 rows       |             1,285.4 |              1,312.0 | +2.07% |                2,201.7 |                 2,241.1 | +1.79% |
| Comment-heavy |             1,363.8 |              1,366.1 | +0.17% |                2,653.6 |                 2,770.6 | +4.41% |

Preloaded improvement repeats across all four populations in each workload, including the small
page's nearly unchanged first population. Normal requests vary: the 96-row candidate wins three
of four populations, while small and comment-heavy results change direction. The small normal
loss should remain visible; these measurements do not prove zero fallback overhead.

The small fixture contains three incidents. The row fixture expands that to 96. The comment-heavy
fixture adds 100 comments to each of three incidents: the selected detail renders 100 comments,
and hydration includes all 300. It is not a hydration-only fixture. Workers expand the same small
controlled API snapshot after fetching it, so normal requests include the small snapshot's API and
parsing costs, not the transfer cost of a realistically enlarged API response. Preloaded requests
reuse that expanded snapshot. Keep the three scenario results separate.

An earlier native version selected the projector inside the ordinary element loop. Its two-population
capture measured about -2.1% small preloaded throughput and +6.4% comment-heavy preloaded throughput.
The retained separate-loop implementation improved the fallback tradeoff. These two captures occurred
at different times and should not be treated as a direct interleaved comparison of the candidates.

## Code, cold process, and memory

Twelve balanced fresh-process pairs measured module import followed by the first small render.
These timings exclude Node process launch and do not measure browser startup. Heap is measured
after two collections with the rendered HTML released. Values below are medians; gzip uses the
same Node `gzipSync` calculation for both artifacts.

| Metric                                   |    Baseline |   Candidate | Difference |
| ---------------------------------------- | ----------: | ----------: | ---------: |
| Server bundle bytes                      |     245,575 |     255,875 |    +10,300 |
| Server gzip bytes                        |      52,479 |      53,685 |     +1,206 |
| Import plus first render                 |    6.659 ms |    7.047 ms |  +0.387 ms |
| Post-GC server heap                      | 5,867,152 B | 5,893,100 B |  +25,948 B |
| V8 code/bytecode and associated metadata | 3,049,548 B | 3,051,705 B |   +2,157 B |

The heap difference is not isolated V8 metadata and is not per-request retained memory. No allocation
reduction is claimed. Cold-process timing comes from one twelve-pair capture and should not be
interpreted as a universal startup penalty. The comparison client bundle remains byte-for-byte
identical, SHA-256 `DFC8BDB32414B88FD23BDE6F41A2F7EA319D0CE72F3AC2ECFD0DFF84D10D6FE4`.

## Validation and limits

The native compiler's Go tests and build pass. The SSR suite passes 232 tests, including eleven
new contract cases using an actual compiled fixture. The tests exercise generated calls, short-array
fallback, malformed values, getter mutation, cycles, prototype failures, limits, and unsupported
versions. Differential checks on the actual bundled candidate pass 200 cases with 642 observed
projector calls. Client and server builds, runtime type checking, package-content checks,
platform-boundary checks, and targeted lint pass.

The lexical-shadowing fixture isolates projector intrinsics while retaining `Object.assign` for the
existing component metadata attachment emitter. General `Object` shadowing in that separate emitter
remains a pre-existing limitation; this pass does not claim to fix it.

The public five-framework charts are not replaced with these synthetic focused captures. A future
comparison with React must use the common framework workload and the updated compiled artifact.
