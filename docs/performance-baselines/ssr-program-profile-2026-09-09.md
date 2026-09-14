# Compiled SSR program profiles, September 9, 2026

Fresh production profiles identify document-shell construction and hydration publication as concrete
sources of eXact overhead. The application shell is already an ordinary eXact component. The compiler
explicitly excludes its `html`, `head`, and `body` elements from render programs, so this component
loses some of the compilation benefits available to its descendants.

The intended optimization is to extend normal component compilation to document hosts. Preserve
normal props, reactive expressions, tasks, state, ownership, and hydration. Do not introduce a separate
shell API, hand-authored string template, or second rendering engine.

No production implementation changed during this investigation. Three isolated artifact experiments
were tested and preserved. Their results do not justify a general throughput claim. Public benchmark
charts remain the historical full capture; this investigation does not replace them.

## Method and evidence

Rebuilt both comparison participants. Node 26.8.1, Bun 1.4.2, React 19.2.0, `NODE_ENV=production`.
Each CPU profile executes 2,000 warmups and 60,000 measured complete-document renders in its own
process. The CLI CPU profiler also captures startup and warmup. Function sample estimates divide
sampled time by 62,000 renders; they are approximate attribution, not exact timers. Profiles include
runtime idle/GC samples. There is one profile per framework/runtime/mode combination, so the timing
values below are diagnostic observations, not stable benchmark estimates.

Both frameworks construct their own full document through their component trees. No HTTP adapter,
socket, load generator, or controlled-service request runs inside these profiles. The streaming probe
consumes the complete result with `Response.text()`, so it includes the runtime stream consumer and
UTF-8 decoding. React's Bun-specific direct stream takes a different internal consumption path from
eXact's standard byte stream. This is not a pure HTML-rendering comparison, nor evidence that their
HTTP transports are equivalent.

The small fixture has three incidents. eXact emits 3,966 bytes and React 3,457 bytes. Both include
initial client data; their hydration representations and marker policies differ. Complete-document
boundaries are checked. Experiments require identical eXact document hashes within each output mode
and scenario. No source edits or builds ran concurrently with timed experiments.

[Raw measurements](ssr-program-profile-2026-09-09.json) and
[profiles, scripts, input, and artifact snapshots](ssr-program-profile-2026-09-09-evidence.zip)
retain the evidence. The archive manifest records SHA-256 hashes.

## Observed profile timings

Microseconds per complete document, lower is better. These profiled, long-loop results must not be
compared directly with the shorter unprofiled runs in earlier reports.

| Runtime | Mode   | eXact | React |
| ------- | ------ | ----: | ----: |
| node    | string | 46.98 | 29.92 |
| node    | stream | 70.15 | 88.17 |
| bun     | string | 49.93 | 35.84 |
| bun     | stream | 74.04 | 66.26 |

## Where eXact performs additional work

### Document component construction

Samples beneath the application `Document` function account for approximately 7.90 microseconds per
render in eXact versus 1.73 in React on Node, and 5.58 versus 1.45 on Bun. These are inclusive
construction costs, not the cost of rendering the whole descendant tree. React's Document samples
also include its initial-data serialization. eXact publishes hydration later.

The compiler's `unsupportedPlannedHost()` in
[`jsx_render_program_lowering.go`](../../native/typescript-go/overlay/internal/exactcompiler/jsx_render_program_lowering.go)
explicitly excludes `html`, `head`, `body`, `script`, `style`, `template`, and `annotation-xml`.
The generated Document therefore issues generic intrinsic receipts for the three document elements
and generic fragment receipts for its asset lists. In the empty-client-tags fixture, all five opaque
operations originate in this shell, including the two empty asset-list fragments.

The Node string profile attributes 6.0% of total samples to `createOpaqueOperation` self time,
3.1% to intrinsic receipt construction, and 2.3% to fragment receipt construction. These function
self times are subsets of Document construction and must not be added to its inclusive total.
Operations allocate immutable identities, attach descriptors, and store private payloads in WeakMaps;
intrinsics also copy props and normalize children. On Bun, native `copyDataProperties` samples lead
back to shell receipts and component scheduling result construction.

Static head children are compiled, but remain separate invocations. For example, the static title
still creates an empty prop bag and a prepared invocation, reads an attribute slot, creates an output
array, and passes through root-attribute and generic child traversal. A compiled program currently
reduces host serialization work without eliminating all intermediate descriptions.

### Hydration publication

The inclusive `renderHydrationScriptValue` stack accounts for approximately 4.42 microseconds per
render on Node and 5.61 on Bun, respectively 8.9% and 10.8% of all samples. A separately instrumented
single render executes `serializeJson` once and visits `validatePositionalValue` 40 times.
There is no evidence here of per-component JSON serialization or repeated serialization of the
complete hydration object. Projection and validation precede the existing single serialization.
React publishes its initial data inside Document using JSON.stringify and script escaping; it does
not implement eXact's component resumption contract. That is a real difference in performed work.

Do not infer that all validation can be removed, or add support for extra special values as a
performance change. Earlier projection and fusion experiments remain relevant. A future compiler
specialization must preserve the currently supported values and boundary failures.

### Intermediate programs and component lifecycle scaffolding

One small eXact document creates 21 prepared server render programs and eight prepared component
references. It performs 25 attribute preparations, 19 text preparations, and eight component-prop
preparations. Four child-range helper calls include two converted into generic asset-list fragments.
These counts describe helper invocations, not distinct allocations or an equal amount of work each.

The Node sampled allocation profile highlights `executeDirectSsrComponent`,
`renderPreparedServerProgram`, `renderComponentReference`, and root-opening operations. Nested
program rendering filters its segment array for scheduled references and establishes cleanup even
when its output is already a single completed string. This is measurable scaffolding that React's
renderer organizes differently.

### Garbage collection and stream consumption

Node string GC self samples were 12.3% for eXact and 5.4% for React, approximately 6.09 and 1.68
microseconds per invocation. A separate allocation-sampling run after warmup, 10,000 renders with
16 KiB sampling and both minor/major collected objects included, estimated 75,023 bytes per eXact
render and 74,777 per React render. Those totals are effectively similar at this precision.
Higher sampled GC time does not establish greater total allocation, a leak, or its cause. Allocation
shape, lifetime, runtime state, and sampling variability need separate investigation.

Bun eXact streaming spends 7.6% of samples in `onReadableStreamToTextChunksFulfilled` and 2.2% in
`onIntoArrayReadFulfilled`. React instead has substantial direct-stream write and consumption samples.
These runtime paths are why the streaming numbers cannot be attributed entirely to compiled HTML
execution. This investigation leaves React and both production transports unchanged.

## Controlled experiments

Each candidate edits an isolated copy of the newly built eXact artifact. Production source and
package outputs remain untouched. These are diagnostic experiments, not shipped fixes.

1. Cached opaque-operation property descriptors. Hypothesis: remove repeated descriptor allocation
   while preserving own nonenumerable properties, immutable identity, and private payloads. Estimated
   opportunity before testing: roughly 0.5 to 2 microseconds per small render. The added lookup and
   Object.create path was generally slower.
2. Direct scheduled-result construction. Hypothesis: remove eight result-spread operations in the
   small fixture while preserving child preparation and cleanup. Estimated opportunity: roughly
   0.3 to 1.2 microseconds on Bun, less on Node. Results were mixed across runtimes.
3. Completed nested-program output. Hypothesis: a single string contains no scheduled component
   references, so bypass reference filtering and scheduling cleanup, while still calling the shared
   output routine for limits and enhancement handling. Estimated opportunity: approximately 1 to 5%
   on workloads containing many small completed programs. Bun streaming improved in all six pairs,
   but Node varied and Bun large string rendering did not improve. This remains a candidate for
   focused follow-up, not a demonstrated general improvement.

The first two experiments use 20,000 measured renders after 2,000 warmups, three rotated orders per
runtime/mode: 36 process populations. Median microseconds:

| Runtime | Mode   | Baseline | Cached descriptors | Direct scheduled result |
| ------- | ------ | -------: | -----------------: | ----------------------: |
| node    | string |    46.58 |              48.89 |                   45.88 |
| node    | stream |    69.37 |              72.21 |                   67.81 |
| bun     | string |    46.24 |              47.09 |                   46.47 |
| bun     | stream |    66.01 |              67.34 |                   66.75 |

The completed-program experiment uses 10,000 measured renders after 2,000 warmups, three alternating
pairs per runtime/mode/scenario: 48 process populations. Large means 96 incidents. These are separate
runs from the table above, so compare candidates only with their corresponding baseline.

| Runtime | Mode   | Scenario | Baseline | Completed-program candidate |
| ------- | ------ | -------- | -------: | --------------------------: |
| node    | string | small    |    53.86 |                       54.41 |
| node    | string | large    |   321.12 |                      301.31 |
| node    | stream | small    |    82.64 |                       82.01 |
| node    | stream | large    |   367.32 |                      371.70 |
| bun     | string | small    |    48.62 |                       48.30 |
| bun     | string | large    |   363.08 |                      364.54 |
| bun     | stream | small    |    68.82 |                       68.62 |
| bun     | stream | large    |   434.56 |                      428.24 |

All 84 completed experimental populations passed document-boundary and paired output-hash checks.
These checks establish fixture output equivalence, not general cancellation or hydration correctness.
No production change was adopted, so the framework/browser suites were not rerun for these temporary
artifact variants.

## Next experiment supported by the evidence

Extend ordinary component render programs to document hosts and coalesce their static head content.
The hypothesis is that removing shell receipts and redundant prepared head invocations recovers a
meaningful fraction of the measured construction cost on both runtimes and output modes. The complete
Document setup sample is an opportunity bound, not an achievable gain estimate: some of its work
must remain. An initial 5 to 10% small-document rendering improvement is a hypothesis to test.

This belongs in compiler/runtime contracts, not the comparison application. Do not simply remove the
compiler exclusion: generic document rendering currently owns head/body normalization and rejection,
host tracking, raw-text rules, and asynchronous scope cleanup. Compiled document operations must
preserve those behaviors in the shared traversal, plus early shell publication, hydration placement,
backpressure, cancellation, and normal client document adoption. The shell remains a normal component
with document-specific host semantics, just as other intrinsic elements have their own host semantics.

Use empty and populated asset lists, dynamic metadata, pending tasks, non-ASCII content, and nested
components. Verify full HTML and browser hydration before promoting the experiment. Render both
string and stream modes with the same engine. Static head coalescing and runtime allocation changes
should be measured separately so their effects remain attributable.
