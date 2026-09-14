# SSR rendering, encoding, and transport costs, September 8, 2026

Status: investigation completed. None of this round's candidates is adopted in production. The ordinary writer remains faster than the experimental byte and string writers. Earlier renderer optimizations remain in place. These diagnostic captures do not replace public benchmark charts or establish React throughput parity.

## Method

Node 26.8.1 rendered the existing preloaded comparison page using two independent drivers at total concurrency 32. Each variant received five seconds of warmup and ten seconds of measurement in each of two fresh process populations, with reversed variant order. Variants ran sequentially on the same workstation; background workload was not controlled. The original eXact response is 3,611 bytes. There is no large-payload case in this round.

The captures passed artifact stability, response identity, telemetry, admission/completion accounting, and zero-request-error checks, including warmups. RPS divides valid responses by the union of simultaneous driver measurement spans. React uses the comparison application's existing Node `renderToString` path. Compare variants within each capture, not absolute rates across separate experiments.

## Head flush and span layout

The first capture separates the experimental writer's head flush from its span layout. Both byte-writer layouts use the same 8 KiB hybrid policy. The hoisted layout exposes static byte spans but also splits previously combined strings: it emits 131 spans instead of 86. Consequently, this is a layout comparison, not an isolated measurement of `Buffer.from` hoisting.

| Variant                           | Valid RPS | Population 1 / 2 |
| --------------------------------- | --------: | ---------------: |
| Ordinary eXact                    |      8066 |      7883 / 8250 |
| Hoisted byte spans, head flush    |      5213 |      5262 / 5165 |
| Hoisted byte spans, no head flush |      5647 |      5566 / 5728 |
| Original spans, head flush        |      5608 |      5472 / 5744 |
| Original spans, no head flush     |      5835 |      5970 / 5699 |
| React                             |      8400 |      8266 / 8533 |

Removing the early flush helps the hoisted variant by 8.3% in aggregate. The original-layout result reverses direction between populations, so it does not establish a stable head-flush penalty. Every experimental variant remains below the ordinary writer. Head flushing also serves latency, so throughput alone is insufficient grounds to remove it from a future streaming implementation.

Compiler inspection confirms that static segment coalescing already exists. The synchronous render target also combines dynamic text markers and root attributes with adjacent strings. Exposing more static buffers can undo that coalescing and add per-span work.

## Rendering versus encoding

Separate CPU profiles and twelve alternating timing rounds measured full rendering into a discard sink and replay of captured spans into the byte writer. The replay sink materializes bypassed strings, including their UTF-8 encoding, but has no socket. These independent measurements are not additive estimates of HTTP latency.

| Operation                               | Mean microseconds |
| --------------------------------------- | ----------------: |
| Original layout, rendering              |             22.50 |
| Hoisted layout, rendering               |             21.21 |
| Original spans, encoding/staging replay |             12.78 |
| Hoisted spans, encoding/staging replay  |             14.54 |

The renderer profile identifies positional hydration validation, byte accounting, JSON serialization, and attribute/text escaping as material work. Encoding replay identifies buffer allocation and UTF-8 writes. A separate one-population HTTP CPU-profile capture identifies substantial transport work in both frameworks and additional writer work in the byte prototype. Profiled HTTP rates are diagnostic only and are excluded from the tables above and below.

Hydration serialization and validation were located through sampled stacks within full rendering, not timed as independent wall-clock phases. A dedicated hydration-only benchmark would be needed to quantify their isolated cost.

## String batching

The second HTTP capture retains the original span layout and compares byte staging against concatenating strings until the byte threshold is reached, then letting Node encode each published batch. The string prototype keeps values whole, so a batch can exceed the threshold by one value. Both experimental writers retain explicit completion and pre-await flush boundaries.

| Variant                        | Valid RPS | Population 1 / 2 |
| ------------------------------ | --------: | ---------------: |
| Ordinary eXact                 |      8859 |      8644 / 9073 |
| Byte staging, no head flush    |      5925 |      5880 / 5970 |
| String batching, head flush    |      6293 |      6263 / 6323 |
| String batching, no head flush |      6605 |      6547 / 6662 |
| React                          |      8438 |      8529 / 8347 |

String batching without the head flush improves on byte staging by 11.5%, but remains 25.4% below ordinary eXact. The ordinary eXact/React ranking changes between the two captures. This is evidence against claiming a durable advantage from either capture alone.

As in earlier prototypes, synchronous traversal is one atomic segment. The writer cannot suspend the compiler's traversal at every backpressure signal. The head split is fixture-specific. These prototypes are experiments, not a finished public streaming API.

## Hydration candidates

Each candidate preserved fixture HTML and hydration bytes and ran twelve alternating rounds of 10,000 full renders after warmup. Times are mean microseconds; each row group has its own control.

| Experiment                                                         | Control | Candidate |
| ------------------------------------------------------------------ | ------: | --------: |
| Grow positional array outputs dynamically                          |   21.22 |     21.45 |
| Grow positional record outputs dynamically                         |   21.22 |     22.56 |
| Grow both outputs dynamically                                      |   21.22 |     21.78 |
| Skip JSON escape replacements when no target character occurs      |   19.83 |     19.76 |
| Replace JSON escape characters in one pass                         |   19.83 |     19.60 |
| Use version-one projectors for small arrays, preserving native Set |   19.49 |     20.94 |

Dynamic array candidates retained length guards because authored getters can shrink source arrays during traversal. Removing those guards would change behavior. JSON candidates also matched output containing closing-script text, Unicode separators, non-ASCII characters, and repeated escape targets. Their small timing differences do not justify adoption from this run alone.

The projector candidate retains native `Set` promotion, which existing version-one generated code is entitled to observe. It is slower. A future projector contract permitting a lightweight ancestor tracker could be evaluated separately while preserving version-one behavior and interpreter fallback. No projector contract or ABI change was made here.

## Follow-up and evidence

The evidence favors reducing hydration traversal and accounting overhead while preserving the existing writer's batching. Any next optimization should first demonstrate a renderer gain with adversarial validation coverage, then survive an unprofiled HTTP comparison with both an unchanged eXact control and React. Hoisted buffers, smaller thresholds, and a Readable wrapper have not demonstrated that gain.

All 11 string-writer tests pass, covering Unicode and byte identity, compiled HTML and hydration, backpressure between atomic writes, and destruction. Production behavior and public options are unchanged, so public documentation pages and performance charts are unchanged.

The [summary](ssr-path-costs-2026-09-08.json) retains aggregate and per-population results, phase profiles and timings, and candidate means. The [evidence archive](ssr-path-costs-2026-09-08-evidence.zip) contains scripts, raw captures, CPU profiles, tests, and compiled artifacts under their original relative paths. Workspace dependencies are required to rerun the scripts. See also the earlier [buffer-size comparison](ssr-buffer-sizes-2026-09-08.md).
