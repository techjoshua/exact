# Immediate response writes and deferred hydration, 2026-09-06

Raw captures referenced in this note are local experiment artifacts and are excluded from Git.
Published chart data is retained under `apps/docs/src/data`.

This corrects the scope of the earlier [footer streaming experiment](node-output-and-hydration-2026-09-06.md).
That prototype collected HTML strings before forwarding them and created serializer callbacks at
the footer. It did not test registering callbacks during rendering while forwarding every HTML write
immediately to the response.

## Implementation actually measured

The new diagnostic adapter forwards each producer call directly to `response.write(chunk)` before
returning to the producer. It has no HTML array, concatenated document string, footer detection,
application-level corking, or queued transport callbacks. Node owns its ordinary transport buffering.

The callback variant registers a serializer when direct component capture reserves a resumption
record during the HTML pass. It captures the record identity, not serialized JSON. Rollback removes
the corresponding callback. After HTML rendering and hydration graph validation, the footer writer
opens the hydration script and invokes those callbacks at the resumption field's position. Each
callback serializes its captured record and writes the result immediately to the response. Root
metadata is also serialized at the footer. No hydration callback produces HTML.

Controls use the same immediate adapter with whole-payload hydration serialization, or with direct
iteration over captured records instead of callback registration. The baseline is the existing
production collector and complete hydration serializer.

## Ordering and output checks

An instrumented artifact, separate from timed workers, asserts that callback registration precedes
the footer and execution follows the hydration script opening. It verifies one execution per
registration. A second check asserts inside the producer that each call has already reached the
response before the producer continues. Buffering and replaying writes cannot pass that check.

Both callback and record variants match the baseline byte for byte through a real Node server for
ASCII and hostile text, including closing-script text, U+2028/U+2029, a surrogate pair, and a lone
surrogate. The timed fixture contains a captured component resumption, so the callback is exercised.

These are diagnostic implementations. Existing renderer byte accounting and graph checks remain;
native hydration accounting uses `Buffer.byteLength`. This does not measure eliminating all byte
bookkeeping. Recoverable renderer ranges retain their existing internal behavior. The adapter itself
forwards every published span immediately. It leaves queued writes to Node and does not suspend
synchronous production when `write()` returns false. It also commits headers before later hydration
or cleanup errors. Native encoding is per write: the earlier transport check also found that high and
low surrogates in separate writes encode differently from joining those spans first. Fixture text
equivalence does not establish arbitrary cross-span equivalence. Those semantics require separate
work before adopting a production streaming path.

## Measurement

Two fresh worker populations each use 12 balanced rounds of 500 ms c32 windows per variant in both
ordinary API-service and preloaded-data lanes, with discarded two-second primes. Response validation
follows timing. The raw evidence (local capture: `immediate-response-writes-2026-09-06.json`) records artifacts, source,
ordering assertions, correctness checks, and individual windows. This is a focused fixture screen,
not a replacement for public framework-comparison charts or a large-document study.

| Variant                                          | Ordinary c32 RPS | Preloaded c32 RPS |
| ------------------------------------------------ | ---------------: | ----------------: |
| Existing buffered response                       |          2,350.0 |           7,091.1 |
| Immediate writes, whole hydration payload        |          1,788.6 |           4,576.8 |
| Immediate writes, registered hydration callbacks |          1,937.5 |           4,506.2 |
| Immediate writes, hydration record iteration     |          1,977.9 |           4,481.8 |

The registered-callback variant lost 17.5% ordinary throughput and 36.5% preloaded throughput.
It lost in both populations and both lanes. This differs materially from the earlier buffered-HTML
prototype's result. It is evidence about the new immediate-write implementation, not retroactive
validation of the earlier test. Removing the callbacks and iterating captured records still lost
15.8% and 36.8%, respectively.

## Byte-accounting removal diagnostic

A second paired screen uses the same two-population, twelve-round method to compare baseline,
immediate callbacks, and immediate callbacks without output byte accounting. The last variant
replaces the fused text escape/count operation with ordinary text escaping, makes the output byte
ledger operations no-ops, and removes hydration byte scans. JSON graph validation and script-safe
escaping remain. Returned byte counts and byte-limit enforcement are intentionally invalid in this
diagnostic; actual HTTP response hashes and bytes must still match baseline. It is an upper-bound
experiment, not a candidate that preserves the current API contract.

| Variant                                     | Ordinary c32 RPS | Preloaded c32 RPS |
| ------------------------------------------- | ---------------: | ----------------: |
| Existing buffered response                  |          2,382.9 |           7,709.8 |
| Immediate registered callbacks              |          1,936.6 |           4,341.7 |
| Immediate callbacks without byte accounting |          1,960.5 |           4,486.6 |

Removing byte accounting recovered 1.2% ordinary throughput and 3.3% preloaded throughput relative
to immediate callbacks in this capture. It still lost 17.7% and 41.8% against baseline. The preloaded
improvement did not repeat in both populations. Keeping accounting cannot explain away the observed
immediate-write regression on this fixture.

Do not adopt either diagnostic. No production runtime or compiler ABI changed. Preserve these
results separately from the earlier buffered-HTML experiment, and do not infer large-document,
time-to-first-byte, or allocation results from this throughput screen.
