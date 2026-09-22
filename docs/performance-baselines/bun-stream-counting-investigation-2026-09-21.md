# Progressive document output investigation

> Retained as a result summary. Raw capture paths mentioned below are historical identifiers;
> bulk samples and private experiment bundles are not distributed. See [benchmark retention](benchmark-retention.md).

This investigation follows the [rejected scheduler experiments](bun-loop-interval-investigation-2026-09-21.md). It compares HTTP admission spacing, encoding, and progressive document buffering against revision `cbf96b235efcf106beb3d4c75a2e41b99623e775`. Measurements use serial private Linux loopback namespaces, Bun 1.4.2, Node v26.9.0, and workspace-resolved 0.6.0 participants. Focused bundles change only the named implementation. The published historical reference is the [September 20 full capture](bun-admission-final-2026-09-20.md).

## Coordination and profiling

Yielding can give native HTTP processing and other callbacks an opportunity to run, but callback count alone does not establish useful coordination. A queue probe observed 128 request starts within one immediate-marker interval with the existing independent 32-request batches. Two prototypes released only one batch per interval. Both preserved cancellation and request ownership. Neither established an offered-load improvement without hurting string throughput, so neither was adopted.

Separate CPU profiles compared fixed-concurrency streaming with scheduled demand. Both sampled approximately 22.5% of elapsed time in native stream completion, 6.4% in UTF-8 byte counting, and 5% in buffer creation. These are sampled attribution observations, not precise native CPU costs. Profiling perturbs throughput, so those runs are not capacity results. Substituting TextEncoder or portable byte counting did not establish a useful improvement.

## Buffering algorithm

The progressive document sink previously counted every small emitted span and appended it to an accumulated string. The candidate retains pending spans in a request-owned array. UTF-16 length supplies a lower bound and three bytes per pending code unit supplies a conservative UTF-8 upper bound. When exact accounting is needed for an output limit, flush threshold, or publication, the sink joins and counts the pending group once. A surrogate pair crossing the collected-prefix boundary receives the same correction as before.

Exact output limits still apply before subsequent authored work proceeds. Head publication, body flush thresholds, closing-tag retention, hydration placement, backpressure, cancellation, and cleanup retain their contracts. The final variant selects grouped buffering only on Bun. Node and other hosts retain the original per-span sink. Neither runtime's admission controller changes. String rendering uses its existing separate collecting sink.

An earlier implementation sliced the uncounted suffix from the growing string. It improved the small streaming fixture but reduced larger-document throughput. That implementation was rejected, and its unfinished Node capture is excluded. The fragment-array version avoids repeatedly materializing that growing prefix.

## Focused observations

At Bun streaming 8,000 offered RPS, the fragment-buffer candidate produced 6,766 valid RPS versus 6,491 for the fresh control, a 4.2% increase. At 10,000 offered RPS it produced 6,697 versus 6,614, a 1.3% increase. Capacity misses remained substantial under overload. These results do not establish complete recovery of scheduled-demand performance. Bun string at 10,000 offered RPS was effectively unchanged at 9,979 valid RPS for both variants.

The larger 96-row streaming fixture improved eXact/React throughput ratios by approximately 16% at c32 and 13% at c128. Node short-protocol results varied with run order. Two publication-protocol pairs subsequently showed consistent c16 losses of approximately 4%, and c32 losses of 3.4% and 6.4%. The universal implementation was rejected. The final Bun-only variant subclasses the existing sink to share publication and cleanup while leaving Node's per-span implementation unchanged. Individual pairs are screening evidence, not confidence intervals.

The private candidate passed 640 output-equivalence cases against the original sink, including split UTF-16 surrogates, output-limit rejection position, emitted chunks, pressure, cancellation, and cleanup. Production-source validation and the full benchmark are recorded separately after adoption.

The structured capture inventory retains every complete result and labels incomplete captures. Response hashes are recorded by the later runners; no response differences were observed in matching fixture variants. Fixed-concurrency results, independent scheduled arrivals, and instrumented profiles answer different questions and are not pooled into one throughput claim.

## Final implementation guards

The Bun-only implementation passed the shared sink contracts and 480 SSR tests, Bun adapter unit and native integration tests, ABI compatibility, package-content and platform checks, source architecture, and docs type checking. The Node sink methods retain their original executable behavior; the runtime selection occurs once at module load.

| Case                            | Variant | Framework | Stage                | Valid RPS | Capacity misses | Response p99 range, ms |
| ------------------------------- | ------- | --------- | -------------------- | --------: | --------------: | ---------------------: |
| host-large-stream-current       | control | exact     | total-c32            |     1,652 |           0.00% |            38.43–38.43 |
| host-large-stream-current       | control | exact     | total-c128           |     1,626 |           0.00% |           94.08–124.86 |
| host-large-stream-current       | control | react     | total-c32            |     1,769 |           0.00% |            35.39–36.19 |
| host-large-stream-current       | control | react     | total-c128           |     1,776 |           0.00% |            78.53–80.32 |
| host-large-stream-host-fragment | grouped | exact     | total-c32            |     1,777 |           0.00% |            30.34–37.18 |
| host-large-stream-host-fragment | grouped | exact     | total-c128           |     1,729 |           0.00% |            91.84–92.48 |
| host-large-stream-host-fragment | grouped | react     | total-c32            |     1,696 |           0.00% |            37.12–37.44 |
| host-large-stream-host-fragment | grouped | react     | total-c128           |     1,696 |           0.00% |            83.90–87.49 |
| host-stream-10000-current       | control | exact     | total-arrivals-10000 |     6,237 |          37.54% |          104.77–155.78 |
| host-stream-10000-host-fragment | grouped | exact     | total-arrivals-10000 |     6,781 |          32.10% |          132.22–143.10 |
| host-stream-8000-current        | control | exact     | total-arrivals-8000  |     6,238 |          21.90% |          147.46–158.08 |
| host-stream-8000-host-fragment  | grouped | exact     | total-arrivals-8000  |     6,395 |          19.94% |          144.38–153.22 |

The [structured results](bun-stream-counting-investigation-2026-09-21.json) retains measured comparisons and capture metadata.
Bulk raw captures and build archives are not retained; see the [retention policy](benchmark-retention.md).
