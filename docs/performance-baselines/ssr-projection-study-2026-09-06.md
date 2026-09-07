# SSR profiling and compiled projection study, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Follow-up: [native compiler integration and confirmation](ssr-native-projection-2026-09-06.md)
tests the actual generated artifacts and retains a selective implementation. The findings below
describe the earlier isolated prototype stage.

The accepted renderer remains unchanged. Fresh profiles identify positional hydration validation
and conversion as the largest named eXact function in three renderer workloads. Several smaller
runtime experiments did not justify adoption. Compiler-generated fixed property reads did improve
larger workloads; a selective prototype gained about 3% comment-heavy HTTP throughput with 718
additional gzip bytes of server code. This is a compiler integration candidate, not a shipped
optimization or a demonstrated lead over React.

The raw evidence (local capture: `ssr-projection-study-2026-09-06.json`) contains profiles, individual interleaved
samples, artifact identities, diagnostic generators, differential checks, and cold-process evidence.
No new compiler ABI, output representation, or public framework behavior was installed. The
production child-range constructor was restored after its HTTP regression. An existing core test
now also covers unmarked ranges with subtree replacement disabled.

## Workloads and attribution

The small fixture has three incidents. The list fixture expands it to 96 incident rows. The
comment-heavy fixture adds 100 comments to each of the three incidents; the selected detail renders
100 comments while all 300 enter hydration. These are synthetic workload variants of the same
compiled application, not independent application architectures or pure hydration-only workloads.
Standalone response sizes are approximately 3.5 KB, 42.3 KB, and 38.0 KB respectively.

Fresh-process CPU profiles include final `Buffer.from` encoding and check returned UTF-8 byte counts.
The small workload warms for 10,000 renders and profiles 50,000; larger workloads warm for 600 and
profile 3,000. Separate allocation sampling covers 1,000 renders. Profiling is attribution evidence,
not an interleaved timing comparison or a retained-heap measurement. No profiling, builds, or tests
run alongside timed captures.

Positional conversion dominates the named framework CPU sites, particularly with comments. Key-list
allocation and replacement positional arrays are prominent allocation sites. Attribute construction,
marker strings, child rendering, and final native UTF-8 encoding also remain visible. The result
supports removing interpretation overhead while preserving validation; it does not support treating
compiler metadata as permission to skip checks on authored values.

## Smaller experiments

Each renderer screen uses four fresh populations, discarded warmup, and 20 balanced batches per
variant and workload. Small batches contain 3,000 renders; larger batches contain 300. Warmup is
five batches' worth. Each render includes final encoding and verifies byte counts; batches must
match the baseline output hash.

- Reusing a frozen empty positional result saves a conceptual array allocation, but timing was
  mixed: approximately 1.6% faster on small renders, 0.7% on the list, and flat on comments.
  Moving empty-array traversal checks also failed to establish a broad improvement. Neither was
  adopted, and no allocation claim is made for these variants.
- Explicit child-range object construction avoids a conditional spread while preserving optional
  marker omission. It modestly improved isolated small/list rendering. A variant that always adds
  the marker field and a shortcut for empty child lists also produced mixed results.
- A native regular-expression scan for safe marker keys lost in every population and workload,
  averaging approximately 1.0%, 2.4%, and 2.2% slower rendering. Retain the existing scan.

The field-preserving child-range candidate advanced to HTTP and allocation checks. Four separate
allocation populations per variant warm for 5,000 renders and sample another 5,000. Aggregate
sampled allocation changes are around one tenth of one percent, close to sampling noise.

| Workload | Baseline ordinary RPS | Child-range candidate RPS | Baseline preloaded RPS | Candidate preloaded RPS |
| -------- | --------------------: | ------------------------: | ---------------------: | ----------------------: |
| Small    |               2,418.3 |                   2,341.3 |                7,961.5 |                 7,843.6 |
| 96 rows  |               1,298.6 |                   1,327.3 |                2,205.1 |                 2,222.9 |
| Comments |               1,403.3 |                   1,389.1 |                2,671.6 |                 2,680.2 |

Small-page ordinary throughput lost 3.2%, reproducing in both populations. Restore the constructor.
The list improvement does not establish a general gain.

## Generated positional projection

The build-time prototype reads the existing literal schemas and emits separate functions with
fixed property names. Unlike the earlier cached-validator-closure experiment, each generated
function has its own fixed property reads, not a shared loop indexing a captured field-name array.

It retains prototype checks, own-key counts, live ownership checks before each read, graph depth
and node limits, cycle detection, and the order of nested validation. Generic leaves use the existing
validator. The original interpreter remains responsible for diagnostic traversal and unsupported
schemas. JSON serialization, script escaping, and hydration bytes are unchanged.

The first prototype generates ten functions across three component schemas. Mean render-plus-encoding
times are 20.551 versus 20.136 microseconds for the small page, 286.509 versus 277.558 for the list,
and 213.250 versus 203.033 for comments. Both larger workloads improve in all four populations;
the small-page direction is mixed.

| Workload | Baseline ordinary RPS | Full projection RPS | Baseline preloaded RPS | Full projection preloaded RPS |
| -------- | --------------------: | ------------------: | ---------------------: | ----------------------------: |
| Small    |               2,402.7 |             2,421.4 |                7,658.8 |                       7,740.0 |
| 96 rows  |               1,315.8 |             1,299.2 |                2,208.4 |                       2,251.0 |
| Comments |               1,353.9 |             1,416.9 |                2,676.7 |                       2,748.7 |

This improves comment-heavy ordinary throughput by 4.7%, but slightly regresses the ordinary list
lane. It adds 12,162 uncompressed bytes and 1,049 gzip bytes. In twelve balanced fresh processes
per variant, median import-plus-first-render time rises from 6.779 to 7.256 ms, and median heap after
first render and collection rises by 28,536 bytes. These measurements include module import and
first rendering, not Node process startup or browser startup; heap differences do not isolate V8
metadata.

## Selective projection and compatibility boundary

Narrowing generation to repeated record shapes emits two functions. The final selective variant
selects a projector once per array, uses it only at length 16 or greater, and keeps the ordinary
interpreter for shorter arrays. The threshold is an experimental choice, not a tuned framework
default. Larger-page render-plus-encoding means improve by about 1.4% on the list and 3.5% on comments.

| Workload | Baseline ordinary RPS | Selective projection RPS | Baseline preloaded RPS | Selective projection preloaded RPS |
| -------- | --------------------: | -----------------------: | ---------------------: | ---------------------------------: |
| Small    |               2,359.4 |                  2,392.0 |                7,748.5 |                            7,812.0 |
| 96 rows  |               1,275.4 |                  1,282.6 |                2,197.6 |                            2,233.4 |
| Comments |               1,368.7 |                  1,410.1 |                2,686.9 |                            2,766.7 |

The comment-heavy gain is about 3% in both lanes and repeats in both populations. The small fixture
does not reach the projection threshold: its variation must not be presented as proof of faster
generated record traversal. Two populations are a screen, not sufficient evidence of consistent
cross-machine improvement.

Selective output adds 4,072 bytes uncompressed and 718 gzip bytes. In its paired cold capture,
median import-plus-first-render time is 7.349 versus 7.259 ms, without an established cold-time
penalty. Median post-first-render heap is 11,128 bytes higher. These server artifacts do not measure
or change client startup.

A further prototype puts validation calls and outcome sentinels behind a versioned context instead
of letting generated functions depend directly on private renderer functions. It retains larger-page
renderer improvements: 286.351 versus 278.229 microseconds on the list and 213.097 versus 202.833
on comments. Small rendering changes from 20.019 to 20.190 microseconds. Its full HTTP, cold-start,
and allocation effects were not measured and must not inherit the unversioned variant's results.

The full projector passes 120 differential checks. Selective and long-array variants each pass
200, including malformed values, ownership mutation, missing and extra fields, prototype failures,
cycles, and limits. The long-array and versioned suites each verify 642 actual projector calls.
An unsupported-version check verifies five schemas fall back to the interpreter with zero generated
projector calls. This demonstrates a compatibility mechanism in the prototype; it does not establish
a released compiler-runtime contract.

## Measurement and adoption limits

Every HTTP capture uses two fresh populations per workload, twelve balanced 500 ms c32 windows
per lane and variant, and discarded two-second primes. Workers expand the controlled service's
small snapshot identically for both variants. Ordinary API payload and parsing costs therefore
remain small; these captures do not model transferring a larger API response. Preloading reuses
the prepared snapshot. Validation follows timing, output identities match, and frozen artifact
hashes are checked before and after. Workloads are summarized separately.

The projection generator modifies isolated bundled artifacts. It is not integrated into the native
compiler. Production work would need native emission, an explicit versioned runtime contract,
cross-module code-size accounting, and validation of the actual emitted artifacts. Bundle-wide
deduplication in this diagnostic must not be assumed to occur automatically across separately
compiled component modules. No prototype is promoted solely on its best timing lane.

The practical finding is a credible optimization target: repeated-record positional conversion.
The current buffered response and whole-payload hydration model remain in production. These
synthetic focused captures do not update or replace the public five-framework metrics charts.
