# SSR allocation and byte-counting experiments, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

Retain shared response accessors and ASCII-prefix scanning in the UTF-8 counter. These reduce
response-object retention and improve the controlled renderer, without changing the compiler ABI.
Normal HTTP throughput remains inconclusive. The raw evidence (local capture: `ssr-allocation-experiments-2026-09-06.json`)
contains ordered samples, artifact hashes, runtime metadata, and the experiment runner sources.

## Ownership and implementation

`packages/server/src/response-body.ts` shares lazy getter functions and property descriptors across
buffered, synchronous-produced, and asynchronous-produced responses. Each getter reads the receiving
response's own body source. Views remain enumerable own properties, with lazy materialization,
single-consumer claims, and request-scope cleanup. This removes per-response getter closures and
descriptor objects. Reflectively borrowing a getter now follows its receiver rather than retaining
the original response; ordinary property access and adapter contracts are unchanged.

`packages/ssr/src/render/utf8.ts` searches for the first non-ASCII code unit when a string has at least
32 code units, credits the ASCII prefix, then counts the remaining Unicode suffix. Short strings
retain direct scalar counting. The counter still matches platform encoding for paired and unpaired
surrogates and allocates no encoded buffer. Hydration validation, byte limits, and generated static
byte facts remain intact. No component ABI method or manifest field was added.

Rejected screens: fixed component-domain fields, a plain-text escaping shortcut, and lazy hydration
collection maps did not consistently improve renderer time. They were not applied to source. An
initial UTF-8 shortcut tested whether the whole string was ASCII; the retained version reuses the
first non-ASCII position to avoid rescanning a long ASCII prefix before Unicode text.

## Method

The baseline is this session's working-tree build frozen before these experiments, including prior
accepted optimizations. It is not the older five-framework chart capture. Node production renderer
bundles and response-factory modules were frozen independently, allowing four combinations. All
HTTP variants use the same unchanged Node adapter, worker harness, controlled API service, route,
and response validation. Every response matched the baseline's byte count and content hash.

- Renderer screens: four fresh child-process populations, 15,000 discarded warm renders per
  variant, then 20 balanced rounds of 2,000 renders. Timings exclude final response hashing.
- Initial HTTP screen: four fresh populations, four variants, 20 balanced 500 ms c32 windows each.
- Final HTTP confirmation: four fresh populations, baseline and both retained changes, 30 balanced
  500 ms c32 windows per variant in each of normal-service and preloaded-data lanes. Each worker
  receives a discarded two-second c32 prime. Aggregate RPS includes final response drain and
  excludes validation. Single requests and 32-request bursts follow the load windows.
- Dedicated sequential confirmation: four fresh populations and all four variants, 30 balanced
  rounds of 25 requests each, after the same discarded prime. This checks whether latency sampled
  immediately after sustained windows represents a repeatable regression.
- Response microbenchmark: 20 interleaved batches of 50,000 produced responses, constructed and
  consumed as text. Retention is a separate six-round comparison of 50,000 live unconsumed responses
  with shared headers and producer, measured after explicit GC. It is not total server heap or a
  measurement of all transient allocations.

No builds, tests, or CPU/heap profilers ran concurrently with timed experiments. The workstation
remained in ordinary use. Interleaving limits drift but does not remove process-layout, scheduling,
or service bottlenecks; process populations are more informative than treating every request as an
independent experimental replicate. Owned workers and the service were closed after each run.

## Results

| Measurement                                         |  Baseline | Retained candidate |                Change |
| --------------------------------------------------- | --------: | -----------------: | --------------------: |
| Renderer mean                                       | 20.729 µs |          20.030 µs |           3.4% faster |
| Produced response construction and text consumption |  0.574 µs |           0.516 µs |          10.1% faster |
| Retained bytes per unconsumed produced response     | about 560 |          about 160 | about 400 fewer bytes |
| Normal HTTP aggregate c32 RPS                       |   2,109.4 |            2,117.7 |   +0.4%, inconclusive |
| Preloaded HTTP aggregate c32 RPS                    |   6,445.4 |            6,588.9 |                 +2.2% |
| 32-request burst mean                               | 15.389 ms |          15.370 ms | effectively unchanged |

Renderer reductions repeated in all four final populations: 1.9%, 2.9%, 4.1%, and 4.6%.
Preloaded HTTP gains also repeated: 2.5%, 0.9%, 0.9%, and 4.9%. Normal-service RPS moved by
-0.7%, +2.3%, +0.7%, and -0.7%. Its variation does not support a general request-throughput claim.
The initial four-way HTTP screen likewise did not establish a throughput improvement.

The single requests immediately following sustained windows averaged 1.464 ms baseline and
1.550 ms combined, a 5.9% increase. These were therefore followed by the dedicated sequential
experiment rather than discarded or presented as proof of a regression.
That dedicated run measured 3,000 requests per variant: baseline averaged 0.904 ms and the combined
candidate 0.904 ms. The combined candidate was faster in two populations and slower in two; the
earlier 5.9% difference did not reproduce. This supports an inconclusive latency result, not a
guarantee that every deployment is unaffected.

The byte-counter microbenchmark exposes a workload tradeoff. For 2,048-code-unit inputs, ASCII
counting fell from 3.67 to 0.94 µs and a trailing non-ASCII character from 3.99 to 1.02 µs. Inputs
beginning with non-ASCII text rose from 3.12 to 3.56 µs; all-CJK text rose from 4.52 to 5.07 µs.
Short ASCII was approximately unchanged in absolute terms. These are isolated counter timings,
not internationalized page benchmarks. Retain the optimization for its measured renderer benefit,
but do not describe it as universally faster for every string.

## Validation and limits

All 372 tests passed across SSR (215), server (143), and Node adapter (14). New tests compare byte
counts with `TextEncoder`, exercise the ASCII threshold and every UTF-16 code unit, and verify
independent lazy response views and single-consumer behavior. Package builds provide production
type checking; the rebuilt participant supplied the final renderer and HTTP candidate.
Documentation type checking and the standalone build completed, as did JSDoc, package-content,
formatting, and diff-whitespace checks. The package-content script was run with `npm_execpath`
pointing to npm's JavaScript CLI because directly spawning `npm.cmd` fails on this Windows runtime.

This experiment does not measure browser startup, browser retained heap, Bun throughput, or a full
framework ranking. The public comparison charts retain their previous complete capture and dates.
The next larger SSR opportunity is in the data-loading and request path: this fixture's rendering
work is a small portion of total request time, so a renderer gain need not yield a comparable
normal-request RPS gain.
