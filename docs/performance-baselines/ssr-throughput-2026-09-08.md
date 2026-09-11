# SSR throughput experiments, September 8, 2026

Status: investigation in progress. Three small runtime optimizations are retained. Node HTTP throughput parity with React has not been established. These diagnostic captures do not replace the public performance charts.

## Retained changes

Primitive `unwrap` calls now return before testing object wrappers. Hydration ancestor removal uses direct last-element indexing. Positional hydration validates primitive cells directly while preserving finite-number checks, unsupported-value rejection, depth and node budgets, and diagnostic paths. Compiler helper signatures and serialized output are unchanged.

In twelve balanced renderer-only rounds of 10,000 renders each, the combined candidate averaged 180.479 ms against 197.398 ms for the previous renderer, an 8.6% time reduction. This measures the comparison fixture's complete render-to-string sink, including hydration, rather than network throughput. Other candidate runs use independent controls and cannot be combined into cumulative percentage gains.

## HTTP experiments

Node 26.8.1 ran the existing preloaded eXact and React comparison fixtures on the same Windows workstation. Captures used two independent drivers and two fresh process populations in reversed framework order. Diagnostic warmups were five seconds; measured stages were ten seconds. These shorter stages differ from the published capacity plan. The profiled run used one population and is excluded from the two-population summary.

The following numbers aggregate valid responses over the union of simultaneous driver stage spans at total concurrency 32. Every summarized capture passed response identity, completion accounting, and zero-request-error validation. Background workstation load was not controlled or measured. Large movements in the unchanged React control make comparisons across captures inconclusive.

| Experiment                                   | eXact valid RPS | React valid RPS |
| -------------------------------------------- | --------------: | --------------: |
| Before retained renderer changes             |           11948 |           12892 |
| After retained renderer changes              |           11985 |           13628 |
| Explicit response headers                    |           11178 |           13196 |
| Encode whole string with `Buffer.from`       |           11284 |           13333 |
| Encode spans and concatenate buffers         |            7149 |           10848 |
| Encode spans into a pooled buffer            |            5935 |            7406 |
| Join strings, then encode into pooled buffer |           10922 |           12191 |
| Readable with cached static spans            |            3181 |           10576 |
| Readable with corking experiment             |             769 |            7985 |
| Readable with 16 KiB buffer batches          |            8718 |           13694 |
| Batched Readable with hoisted static buffers |            8465 |           13410 |
| Final ordinary-writer control                |            9168 |            8018 |

The final control does not demonstrate an improvement from the streaming experiments: it uses the ordinary writer, and React also slowed substantially. Header, buffer, pool, and Readable candidates are not integrated into production.

## Buffer encoding and ownership

Isolated encoding measurements show workload dependence. For the actual small fixture, creating a buffer per span and then concatenating was substantially slower than joining strings and encoding once. Pools helped some larger synthetic outputs. In the second encoding experiment, the 1 MiB case averaged approximately 410 microseconds for incremental pooled encoding and 501 microseconds for string assembly plus `Buffer.from`. These are encoding-only measurements, not HTTP capacity results.

The pool prototype bounds retained memory and releases response-owned buffers only after write completion. Its checks cover Unicode split across spans, growth, simultaneous leases without aliasing, and repeated release. Hoisted static buffers remain immutable and never enter the mutable pool.

## Proposed pull-driven byte renderer

The Readable prototype verifies static-byte reuse, Unicode, larger bodies, producer failure, and identical fixture output. It does **not** implement a resumable tree traversal. Its first `_read` completes the existing synchronous renderer into a buffer array, then drains that array under stream backpressure. The hoisting experiment replaces 27 generated static literals with module-level `Buffer.from` constants in a temporary Node artifact. It still uses much of the existing string-oriented renderer. Its poor results cannot establish the performance of a dedicated byte renderer.

A complete design would have the following ownership and ordering:

1. A request-local traversal cursor retains component frames and the current child position. `_read` advances it until a bounded batch is ready.
2. The Node rendering target reuses immutable static byte constants and encodes escaped dynamic values. Node-specific constants must not enter browser or platform-neutral artifacts.
3. When `push` reports backpressure, traversal pauses. No further components are evaluated until the consumer asks for more data.
4. Completed component hydration records accumulate under the existing serialization limits. Hydration output follows the component tree and precedes the document owner's closing body and HTML tags.
5. Cancellation or failure unwinds every retained component scope. Mutable output storage remains leased until its consumer has finished with it.

Batching may use `Buffer.concat` when several small buffers need one write, with a known total length. Concatenating the entire document defeats bounded output buffering. The additional copy must be measured against stream and socket write overhead.

The existing synchronous generated functions cannot suspend midway through their operation sequence. A dedicated cursor must therefore use deferred operations or an additive compiler target, with explicit review of execution order, enhancement ranges, component cleanup, output limits, and errors after headers have been sent. Old compiled artifacts must retain their supported rendering path. This architecture remains unimplemented.

## Other candidates and validation

Dense projection arrays and earlier generated hydration projection showed promise in artifact-only experiments. Removing native `Set` promotion is not a valid version-one runtime optimization: released generated projectors may require an actual `Set`. Such a change needs an explicit additive traversal contract and legacy fallback before production use. No projector contract change is retained.

The rebuilt comparison passed all 35 shared browser contracts. Final individual package runs passed 893 tests: core 244, hydration 219, SSR 235, reactive 178, and Node adapter 17. An initial aggregate-project invocation exited unsuccessfully with socket-listener warnings and no completed test report; the individual package runs completed successfully. Builds, focused lint, source architecture, JSDoc, and frozen 0.5.0 artifact checks passed after the retained changes. The ABI remains epoch 1 at 0.5.0.

The [machine-readable summary](ssr-throughput-2026-09-08.json) retains every renderer candidate and two-population HTTP capture summary. The [evidence archive](ssr-throughput-2026-09-08-evidence.zip) contains raw captures, experimental scripts and artifacts, profiles, and validation logs. Extract it at the repository root to restore the original `.tmp` paths. Experimental files are not supported runtime implementations.
