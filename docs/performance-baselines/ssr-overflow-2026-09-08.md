# Direct SSR writer overflow experiments, September 8, 2026

Status: experiments completed. No production writer or compiler ABI change is adopted. Overflow policy depends on the size and distribution of incoming spans. Explicit corking did not establish an HTTP throughput improvement.

## Policies

All candidates use a direct Node `Writable` sink with an 8,192-byte staging threshold and lazy replacement allocation. They have no intermediate `Readable`, pipeline, or whole-response span array. Small inputs that fit take the same path. The policies differ when an incoming value exceeds the remaining space:

- **Split:** fill remaining staging space, publish it, and continue through replacement buffers. This experiment also splits large values, allowing the cost of that decision to be measured.
- **Combine:** publish the pending bytes and the entire incoming value as one combined allocation. Incoming strings encode directly into that allocation, avoiding an intermediate encoded buffer; byte inputs use `Buffer.concat`. With no pending bytes, write the value directly.
- **Direct:** publish pending bytes, then write the incoming value directly as a separate write. Large strings remain strings until Node encodes them.
- **Direct with cork:** the direct policy, with the overflow pair wrapped in `response.cork()` and `response.uncork()` in `try`/`finally`.

Published staging buffers are never overwritten. A write is atomic; capacity is remembered across its destination writes, and a caller that can suspend waits between writes for `drain`. Destruction drops unpublished storage and terminates the destination. Dynamic spans preserve split UTF-16 pairs; byte inputs are already complete UTF-8 constants.

The legacy comparison renderer still executes synchronously as one atomic segment. These experiments do not make traversal resumable, and Node may buffer that segment beyond its high-water mark. They do remove the prior prototype's extra span-array and Readable layers. The known benchmark document envelope requests a head flush in every candidate. This is fixture-specific, not a framework HTML parser. Production pre-commit error-response behavior is not implemented by this experimental adapter.

## HTTP method

Node 26.8.1 ran two independent drivers at total concurrency 32, five-second warmups, and ten-second measured stages. Each case used two fresh process populations with reversed variant order. The first capture compared the ordinary eXact writer, all three policies, and React. A second capture compared uncorked and corked direct writes, again in reversed order. The small page was unchanged. The 65,536-byte case pads each framework's normal page to the same total size, so it chiefly tests one large trailing value rather than a larger component tree.

All runs were sequential. Background workstation load was not controlled or measured. Entry artifacts, experimental writers, worker scripts, and built server/adapter outputs were checked for stability. eXact response identity matches across policies and the ordinary writer for each payload size. Completed captures pass admission/completion accounting and zero-request-error validation, including warmups. React uses the existing Node `renderToString` benchmark path.

Valid RPS aggregates responses over the union of simultaneous driver stage spans across both populations. No public performance chart is replaced by these diagnostic results.

| Writer                 | Original page valid RPS | 64 KiB valid RPS |
| ---------------------- | ----------------------: | ---------------: |
| Ordinary eXact control |                   10739 |             7558 |
| Split                  |                    6395 |             5145 |
| Combine                |                    6405 |             5635 |
| Direct                 |                    6408 |             5716 |
| React control          |                   11372 |             8668 |

The original page is smaller than the threshold and does not exercise overflow. Its candidate results therefore act as a control for variation. At 64 KiB, combine is 9.5% above split and direct is 11.1% above split. Direct's 1.4% aggregate lead over combine is not consistent across populations: direct wins the first and loses the second. The experiment does not establish a winner between them. All three remain slower than the ordinary eXact writer.

## Cork comparison

| Variant          | Original page valid RPS | 64 KiB valid RPS |
| ---------------- | ----------------------: | ---------------: |
| Direct           |                    6400 |             5786 |
| Direct with cork |                    6506 |             5766 |

At 64 KiB, corking loses in the first population and wins in the second, with a 0.3% aggregate decrease. The small-page difference occurs without overflow, so the explicit cork branch is not exercised there. These measurements do not justify claiming a corking improvement or regression.

The cork test independently proves that the overflow pair can reach a `Writable` as one vectored write. Node 26's `_http_outgoing` implementation already corks socket writes until the next tick, while explicit response corking also accumulates HTTP chunk framing. That distinction explains why explicit corking can change batching without necessarily improving this workload's throughput.

## CPU and encoding experiment

A separate timing loop replays spans into a counting sink. Bypassed strings are materialized with `Buffer.from`, so their UTF-8 encoding is included. There are no socket syscalls or asynchronous waits. Twelve rounds alternate mode order after warmup. The table reports mean microseconds per replay, with destination write counts in parentheses.

| Input shape                     |        Split |      Combine |       Direct |
| ------------------------------- | -----------: | -----------: | -----------: |
| Compiled fixture spans          |    10.14 (1) |    10.21 (1) |    10.24 (1) |
| Many small spans, about 64 KiB  |    72.21 (8) |    90.86 (8) |   70.79 (15) |
| Several values crossing 8 KiB   |     8.60 (3) |    12.35 (2) |     9.55 (4) |
| One 1 MiB value plus wrapper    | 286.41 (129) |   199.72 (2) |   200.11 (3) |
| Many small spans totaling 1 MiB | 878.99 (128) | 871.80 (128) | 925.93 (128) |

The large-single-value result supports bypassing staging for large values. The smaller-value cases show why always combining at overflow is not automatically faster: copying pending bytes into a new allocation can outweigh reducing write count. Conversely, the direct policy's extra writes are cheap in this counting sink but need not be cheap over HTTP. These are encoding and batching measurements, not full SSR throughput.

A hybrid policy that fills small spans and bypasses large values remains a reasonable next candidate. The present evidence does not support replacing the production writer with any measured candidate.

## Validation and evidence

All 13 focused tests pass. Coverage includes exact byte identity, split Unicode, retained-buffer immutability, real Writable backpressure, unchanged compiled HTML and hydration, destruction, the three intended overflow boundaries, vectored corked writes, and uncorking after a thrown write. No task-owned benchmark or compiler process remained after completion.

The [summary](ssr-overflow-2026-09-08.json) retains aggregate and per-population HTTP results and CPU summaries. The [evidence archive](ssr-overflow-2026-09-08-evidence.zip) contains raw captures, scripts, experimental artifacts, and tests under their original relative paths. Runtime workspace dependencies are still required. The prior [staging experiment](ssr-staging-2026-09-08.md) records the Readable approach; differences across those separate captures cannot isolate the benefit of removing that layer.
