# Hydration marker experiments, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Three ideas were tested independently: use a compiled row's intrinsic root as its keyed item
boundary, replace paired scalar comments with one parsed-text-length marker, and remove element
identity attributes. A fourth candidate combined the first two. Broad identity removal was a
diagnostic upper bound, not a compiler implementation of selective identity elision.

Retain the keyed element boundary. Do not retain the text-length protocol or broad identity
removal. The raw evidence (local capture: `hydration-marker-study-2026-09-06.json`) preserves both screens,
browser samples, source snapshots, experimental tests, artifact hashes, and runners.

## Response and code size

These are complete comparison documents, measured without changing semantic markup or hydration
JSON. Each cell is uncompressed bytes / gzip bytes; gzip uses the same Node defaults throughout.

| Candidate                           |    Small page |        96 rows | Comment-heavy page |
| ----------------------------------- | ------------: | -------------: | -----------------: |
| Baseline                            | 3,710 / 1,304 | 42,491 / 2,499 |     38,180 / 3,076 |
| Keyed element boundary              | 3,611 / 1,279 | 39,323 / 1,900 |     34,201 / 2,427 |
| Text-length marker                  | 3,656 / 1,308 | 40,763 / 2,503 |     38,126 / 3,082 |
| Remove identity attributes (unsafe) | 3,550 / 1,243 | 38,611 / 2,356 |     38,020 / 3,013 |
| Keyed + text                        | 3,557 / 1,286 | 37,595 / 1,867 |     34,147 / 2,432 |

Keyed-only reduces compressed response size by 24.0% on 96 rows and 21.1% on the comment-heavy
fixture. It adds 271 uncompressed / 53 gzip bytes to the browser JavaScript. Text-only adds
441 / 152 bytes; the combination adds 712 / 205 bytes. The text protocol saves uncompressed HTML,
but its length values compress less regularly than the previous repeated delimiters. On 96 rows,
adding it to keyed-only saves another 33 gzip response bytes while adding 152 gzip JavaScript bytes.

## Browser measurements

Chromium used a fresh context per sample, with one discarded warmup round and rotating/reversing
variant order. The initial screen had eight measured rounds per variant and scenario; confirmation
had 24 rounds for baseline, keyed-only, and combined. All measured pages verified adoption of the
original SSR rows and a working claim interaction. Separate correctness runs also filtered rows.

The time below is semantic readiness after response completion. It includes HTML parsing, script
loading/execution, and startup work; it is not an isolated hydration timer. Heap is post-interaction,
post-GC CDP JavaScript heap and includes V8 overhead. It is not a categorized retained-heap snapshot.

| Candidate              | Small readiness median | 96-row readiness median | 96-row JS heap median | DOM nodes |
| ---------------------- | ---------------------: | ----------------------: | --------------------: | --------: |
| Baseline               |               41.30 ms |                60.70 ms |           2,630,140 B |     1,422 |
| Keyed element boundary |               41.15 ms |                59.60 ms |           2,627,738 B |     1,230 |
| Keyed + text           |               41.10 ms |                63.30 ms |           2,631,360 B |     1,230 |

Keyed-only removes two retained comments per row. Scalar comments were already removed during
hydration, so the text-length protocol has no retained-node benefit. The timing and small heap
differences are descriptive samples on an actively used desktop, not a demonstrated universal
startup improvement. The node and byte reductions are deterministic.

## SSR measurement method

The five-way screen used two fresh worker populations for each of small, 96-row, and comment-heavy
fixtures, with six 500 ms windows per variant/lane/population after two seconds of priming. The
confirmation used baseline, keyed-only, and combined, twelve windows and five seconds of priming.
Both rotated and reversed variant order at concurrency 32, with normal and preloaded lanes in
alternating order across populations. No builds, tests, or browser profiling ran during timed HTTP
measurements. Every response was checked against its variant's own expected hash and size, and
normalized HTML plus hydration data was compared between variants before timing.

Normal requests retain the controlled service call; large fixtures are expanded in the worker
after fetching the small service response. Preloaded requests reuse prepared input. This isolates
rendering workload size and does not model the network cost of a large real API response. The
load generator includes response receipt and final drain in elapsed time, with validation outside
the timed loop. These focused results do not replace the published full-framework comparison or
establish a new comparison against React.

The longer-warmup confirmation produced these aggregate throughput changes against baseline:

| Workload      | Keyed, normal | Keyed, preloaded | Combined, normal | Combined, preloaded |
| ------------- | ------------: | ---------------: | ---------------: | ------------------: |
| Small         |         +1.5% |            +1.2% |            +8.1% |              +10.2% |
| 96 rows       |         +7.7% |           +12.2% |           +12.0% |              +11.0% |
| Comment-heavy |         +8.6% |           +22.7% |           +11.6% |              +21.3% |

Population variation remains material: keyed-only normal throughput on 96 rows changed by +18.3%
and -2.2% in the individual populations. Its preloaded results were positive in both (+19.1% and
+5.4%). Retention is supported most strongly by the deterministic wire and DOM reductions, rather
than a promise of these exact RPS gains. The combination has a stronger small-page SSR result,
but gives back browser startup time on the larger page and does not improve the larger preloaded
cases over keyed-only. Keyed-only also adds about 2 KB of small-page retained JS heap in this sample;
the optimization is not literally cost-free.

## Correctness and compatibility

The retained optimization applies only to compiler-prepared programs owning one intrinsic root in
the synchronous keyed path. The keyed receipt still carries its key and item effect scope. Generic
and multi-node items, asynchronous paths, and server keyed-list patch snapshots retain their
existing explicit boundaries. The client accepts both element-bounded rows and older paired item
comments; no compiled ABI method is added or removed. Server output and its browser runtime still
need to be deployed as matching framework artifacts.

Regression coverage exercises adoption, keyed reorder, focus retention, label changes,
insertion/deletion, and disposal. Existing paired-marker adoption and server list-patch tests remain.

The text experiment additionally tested empty values, surrogate pairs, line-ending normalization,
escaping, independent updates, and invalid extents. HTML NUL handling required a legacy-marker
fallback because it differs by namespace. That parsing work and the browser/code cost make it a
weaker default despite some promising SSR samples. Its implementation and tests are archived,
rather than retained as an unused runtime option.

Removing all `data-exact-id` attributes passed ordinary comparison-page hydration, but a focused
property-patch test failed to resolve an unmarked target. Production code also consumes these
identities for server diffing, deferred interaction replay, and form recovery. A future selective
optimization must prove that each omitted identity is unnecessary for all those consumers; a
global string removal is not that proof.

## Final validation

The retained tree passes 272 DOM tests, 232 SSR tests, TypeScript package builds, targeted lint,
platform-boundary checks, and published-package content checks. The experimental scalar edge
suite passes six cases including the NUL fallback; the identity counterexample and existing patch
suite pass 17 tests. The final browser bundle is byte-identical to the measured keyed-only bundle.
The final server bundle adds 110 bytes of documentation comments; parsed executable output is
identical with comments removed. No timing claim depends on a later implementation rewrite.
