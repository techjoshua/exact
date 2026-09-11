# Native hydration byte accounting, September 8, 2026

The synchronous compiler-closed sink now reuses the consuming adapter's UTF-8 byte counter for
the escaped hydration payload. Previously the supplied counter served HTML accounting while
hydration always used the portable JavaScript implementation. Calls without an adapter capability
retain the portable counter. This changes neither serialization nor output limits.

The Node adapter already supplies `Buffer.byteLength`; no new application option or platform
dependency enters the SSR package. Existing compiler artifacts remain compatible. The internal
hydration helper gains an optional final argument, and the runtime sink forwards its existing
environment capability. The Node application was rebuilt and matched the experimental artifact
after deterministic minification.

## Earlier candidates rejected

Combining the synchronous produced response and its body owner removed an allocation and a
property installation. Construction plus consumption improved from 0.287 to 0.177 us, but nine
alternating HTTP rounds averaged 13,661 RPS for the control and 13,640 for the candidate. The
prototype and ownership refactor was not retained.

Combining the three hydration escaping replacements into one scan was also rejected. It was
slightly slower for the original payload and substantially slower for densely escaped text.
A guarded fallback did not provide a useful consistent improvement. Escaping remains unchanged.

## Renderer measurements

The paired renderer fixture extends the incident titles with 30 or 1,000 repetitions of a space,
two CJK characters, and an emoji. It preserves identifiers, route selection, and other state.
Each variant receives the same data. Assertions check identical full output and exact UTF-8
accounting. Twelve alternating rounds follow warmup, with 1,000 renders per round. These timings
include the common byte-count assertion and must not be substituted for earlier renderer timings
that used a different measurement loop.

| Node 26.8.1, time per render | Before (us) | After (us) | Reduction |
| ---------------------------- | ----------: | ---------: | --------: |
| Original fixture             |       18.52 |      18.28 |      1.3% |
| Moderate Unicode extension   |       22.75 |      21.55 |      5.3% |
| Large Unicode extension      |      132.70 |     103.69 |     21.9% |

Bun 1.4.2 executing the same Node-target artifact showed 9.0% and 16.3% reductions for the Unicode
extensions, with a small 2.1% regression on the original fixture. This is not a native Bun HTTP
result: the Bun adapter's existing Blob path does not supply this byte-counter capability.

## Node HTTP results

The freshly built candidate and preserved control alternate within one eXact worker; React has its
own worker. Nine rounds rotate and reverse their order after warmup, using two independent drivers,
32 total concurrency, and three-second blocks. All response hashes are validated. RPS uses total
valid responses divided by the union of the driver intervals. Builds, tests, and timing workloads
run serially; other workstation activity is uncontrolled.

| Workload                | eXact before RPS | eXact after RPS | Change | React RPS |
| ----------------------- | ---------------: | --------------: | -----: | --------: |
| Original document       |           13,218 |          13,298 |  +0.6% |    14,125 |
| Large Unicode extension |            3,885 |           4,396 | +13.2% |     6,173 |

The original-document candidate wins only four of nine rounds, so the small mean difference does
not establish a gain. The Unicode candidate wins all nine rounds. Its complete response is 80,485
bytes before and after; React's is 80,384 bytes. This is a deliberate larger internationalized-text
stress case, not the original 3,485-byte document. The optimization is retained for its demonstrated
reduction in non-ASCII accounting work and its small implementation cost.

All stages have zero request errors. These concurrency stages do not test offered-rate overload.
eXact remains behind React in both workload means; this change does not achieve overall HTTP parity.
These targeted alternating results do not replace the public benchmark suite or establish peak RPS.

## Validation

The new test compares the portable and supplied counters for CJK characters, emoji, script-breaking
text, line separators, lone surrogates, and Unicode script attributes. It verifies the final script
byte count and exact acceptance/rejection at the hydration payload byte limit. The server, SSR,
and Node-adapter suites pass 412 tests. All 14 paired application browser tests pass. Test type
checking, focused lint, release ABI validation, and platform-boundary checks pass.
Frozen 0.5.0 artifacts also pass client tasks, reactive updates, keyed identity, SSR, hydration,
and disposal. Source architecture and JSDoc checks pass. All benchmark-owned processes are closed.

Public aggregate benchmark charts remain unchanged. Runtime source changes are limited to
forwarding the byte counter and using it for the already-escaped hydration payload.

The [machine-readable results](ssr-native-hydration-bytes-2026-09-08.json) retain individual rounds,
renderer samples, artifact hashes, response identities, and rejected experiments. The
[evidence archive](ssr-native-hydration-bytes-2026-09-08-evidence.zip) contains the raw captures,
paired renderer artifacts, runners, candidate source, retained source/tests, and a SHA-256 inventory.
