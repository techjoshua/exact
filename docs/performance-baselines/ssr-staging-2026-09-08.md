# Request-owned SSR staging experiment, September 8, 2026

Status: experimental implementation, not enabled in the framework or published as an API. The request-owned buffer lifecycle passes focused tests, but the comparison-app adapter is slower than the ordinary writer. A dedicated resumable compiler traversal remains outstanding.

## Implemented experiment

`StagingReadable` starts its producer from `_read`. It allocates dynamic staging storage lazily and accepts references to immutable UTF-8 static buffers. A batch flush relinquishes the staging buffer before publishing bytes. Multiple spans use `Buffer.concat` with their known total length; a single span is pushed directly. Flushed storage is not reused or returned to a pool.

`flushThresholdBytes` defaults to 8,192 and is configurable. The prototype accepts safe integers of at least four bytes so one UTF-8 code point fits in staging. Its producer has explicit flush operations for a completed head and before a task wait, independent of the threshold. The end-of-production path emits remaining bytes before EOF. The buffer layer does not invent hydration records or document closing tags; the producer supplies those in order.

Writes return without a promise unless backpressure requires waiting. When `push` returns false, the producer must honor the returned promise before continuing. Later `_read` demand releases that wait. Dynamic encoding preserves UTF-16 surrogate pairs split across authored string spans. Static byte inputs must already contain valid complete UTF-8 encodings.

On producer failure, the source calls `destroy(error)`. The pipeline also destroys the source on destination failure. `_destroy` clears staging, pending span references, surrogate carry, the producer callback, and abort listeners. It rejects any suspended write and invokes cancellation once. Cleanup failures remain observable alongside the original error. Dropping references makes owned storage eligible for garbage collection; it does not synchronously free memory still owned by downstream consumers.

## Scope and limits

The byte producer supports suspension, but the existing generated synchronous renderer does not. The comparison-app bridge therefore captures its whole response as spans before passing them to the new producer. It also recognizes the benchmark's known first document-envelope chunk to request the head flush. This is a fixture-specific experiment, not a general HTML parser or framework document contract. In particular, it does not deliver the head before the legacy tree crawl completes.

The focused asynchronous fixture verifies that explicit head and pre-task flushes publish bytes before pending work completes. Framework integration must still restrict publication to finalized output, retain provisional component ranges across blocking task retries, and place hydration records correctly. The experiment's `pipeline` failure behavior destroys the HTTP response; it does not implement the production writer's pre-commit generic error response.

## Validation

All ten focused tests pass:

- byte thresholds, Unicode, hydration ordering, and closing tags;
- head and pre-task flush timing;
- paused production under backpressure and unchanged previously published bytes;
- destruction and staging release on producer failure;
- abort while backpressured;
- original and cleanup error preservation;
- already-aborted requests and trailing unmatched surrogates;
- invalid configuration;
- downstream write failure destroying both endpoints;
- concurrent request isolation with shared immutable static buffers.

The actual compiled comparison fixture matches the saved original output at 4, 8, and 16 KiB. Two real HTTP captures each completed two fresh, reversed eXact/React populations using two drivers, five-second warmups, and ten-second stages at total concurrency 32. Response identities and request accounting passed, with zero request errors. These runs were sequential, and workstation background load was not measured.

| Writer                      | eXact valid RPS | React valid RPS | eXact / React |
| --------------------------- | --------------: | --------------: | ------------: |
| Experimental staging, 8 KiB |            4161 |           11140 |         0.374 |
| Ordinary writer control     |           10708 |           12079 |         0.886 |

The small comparison page is below 8 KiB. This measures head flushing, encoding, stream plumbing, and the legacy span capture overhead, rather than a useful threshold comparison. The experiment is not adopted. The results do not establish how a dedicated byte-oriented traversal would perform.

## Threshold comparison

A separate synthetic producer interleaves shared static buffers and dynamic text. Ten rounds alternate threshold order after warmup. The consumer counts bytes without network I/O. These times include producer calls, encoding, batching, and stream consumption; they are not SSR or HTTP throughput measurements.

| Output bytes | 4 KiB, microseconds | 8 KiB, microseconds | 16 KiB, microseconds |
| -----------: | ------------------: | ------------------: | -------------------: |
|         3968 |               20.10 |               20.10 |                20.79 |
|        63488 |              156.16 |              147.41 |               144.75 |
|      1015808 |             1993.09 |             1931.41 |              1835.58 |

Larger thresholds modestly improve these larger synthetic cases. The result supports configurability, but is insufficient to choose a production default or establish browser-visible latency benefits. Public benchmark charts remain unchanged.

## Evidence

The [combined summary](ssr-throughput-2026-09-08.json) includes `http-staging-8192.json` and `http-staging-control.json`. The updated [experiment archive](ssr-throughput-2026-09-08-evidence.zip) preserves the prototype, tests, actual-fixture check, threshold benchmark and samples, and raw HTTP captures under `.tmp/ssr-throughput`. Extract it at the repository root alongside the current checkout to restore the experimental paths. The earlier [SSR investigation](ssr-throughput-2026-09-08.md) explains the surrounding renderer experiments.
