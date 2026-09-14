# Hybrid SSR writer buffer sizes, September 8, 2026

Status: experiments completed. No production writer, public option, or compiler ABI change is adopted. A 2 KiB staging buffer modestly improves the small-page result in this run, while 8 KiB modestly improves the padded large-page result. Buffer size alone does not close the gap to the ordinary writer.

## Fixed policy

The same direct Node writer was tested with `flushThresholdBytes` set to 2,048, 4,096, or 8,192 bytes. Small spans fill the remaining staging space and continue into a replacement buffer when necessary. Values whose UTF-8 size exceeds the full staging threshold bypass it after pending output is flushed. This is the eXact experimental hybrid policy, not a reproduction of React's entire writer or its string-size heuristic.

Head flushing, completion flushing, and flushing before awaiting producer completion are identical in each variant. No explicit corking is introduced. The writer allocates staging lazily, relinquishes published buffers, preserves split Unicode pairs, and destroys the destination and drops unpublished storage on failure. Large bypassed values may exceed the staging threshold, which is not a maximum HTTP chunk size.

As in the earlier direct-writer experiments, the existing synchronous compiler output runs as one atomic segment. It cannot suspend traversal at each transport write. Node may buffer the remainder of that segment after signaling backpressure. These results test encoding and transport choices without adding the previous Readable or span-array wrapper; they do not establish a complete resumable renderer.

## HTTP results

Node 26.8.1 ran two independent load drivers at total concurrency 32. Each stage used five seconds of warmup and ten seconds of measurement. Two fresh process populations reversed variant order. The ordinary eXact writer and React's existing Node `renderToString` path were included as controls. All variants ran sequentially on the same workstation; background load was not controlled or measured.

The original page was unchanged. The 64 KiB case pads each framework's ordinary page to 65,536 bytes, primarily adding one large trailing value rather than more components. Response identities match across all eXact variants and their ordinary-writer control at each payload size. Captures passed artifact stability, telemetry, admission/completion accounting, and zero-request-error checks, including warmups.

Valid RPS aggregates valid responses over the union of simultaneous driver stage spans across both populations.

| Writer                 | Original page valid RPS | 64 KiB valid RPS |
| ---------------------- | ----------------------: | ---------------: |
| Hybrid, 2 KiB          |                    6608 |             5633 |
| Hybrid, 4 KiB          |                    6527 |             5690 |
| Hybrid, 8 KiB          |                    6423 |             5776 |
| Ordinary eXact control |                   10670 |             7359 |
| React control          |                   12006 |             7854 |

Compared with 8 KiB, 2 KiB is 2.9% ahead on the small page and 2.5% behind on the padded page. Both directions hold across the two populations, but the differences are modest and the small-page ranking between 2 and 4 KiB reverses between populations. Two populations do not establish a general optimal size. Every hybrid variant remains slower than the ordinary eXact control.

## Isolated span measurements

A separate counting sink replays fixed spans after warmup. It materializes bypassed strings with `Buffer.from` so their UTF-8 encoding is included. Twelve rounds alternate threshold order. These measurements include encoding, staging, and allocation but no socket syscalls, asynchronous waits, or component rendering. Values are mean microseconds per replay, with destination write counts in parentheses.

| Input shape                     |         2 KiB |         4 KiB |         8 KiB |
| ------------------------------- | ------------: | ------------: | ------------: |
| Compiled fixture spans          |     10.62 (2) |     10.57 (1) |     11.91 (1) |
| Many small spans, about 64 KiB  |    82.92 (31) |    83.21 (16) |     79.53 (8) |
| Several medium values           |      8.58 (4) |      8.26 (4) |     12.65 (3) |
| One 1 MiB value plus wrapper    |    255.33 (3) |    253.87 (3) |    250.49 (3) |
| Many small spans totaling 1 MiB | 1268.05 (512) | 1271.89 (256) | 1304.04 (128) |

Smaller buffers can reduce encoding/allocation time in some cases while increasing destination writes. The counting sink makes those additional writes inexpensive, so the many-span results must not be interpreted as equivalent HTTP gains. In the medium-value case, changing the threshold also changes which values bypass staging, an intentional property of this hybrid policy.

The evidence supports retaining configurability while optimizing the rendering and transport path. It does not justify adopting 2 KiB solely because React uses that staging size. Public performance charts remain unchanged.

## Validation and evidence

All 11 focused tests pass. They cover byte identity and Unicode, retained-buffer immutability, real Writable backpressure, unchanged compiled HTML and hydration at each size, destruction, and the hybrid's small-span versus large-value behavior. No task-owned benchmark or compiler process remained after completion.

The [summary](ssr-buffer-sizes-2026-09-08.json) retains aggregate and per-population HTTP results plus isolated span summaries. The [evidence archive](ssr-buffer-sizes-2026-09-08-evidence.zip) contains raw measurements, scripts, tests, and artifacts under their original relative paths. Runtime workspace dependencies remain required. The previous [overflow experiments](ssr-overflow-2026-09-08.md) explain the policy alternatives that motivated this comparison.
