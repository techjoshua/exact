# Backpressure at the head publication boundary

Date: 2026-09-09. Prototype correctness experiment; production unchanged.

A pressure-aware wrapper now permits one outstanding asynchronous byte publication. Writes while
that publication is pending are rejected instead of queued without a bound. A signal abort or
transport rejection closes the sink, clears staged data, and rejects the renderer's wait. The
wrapper retains the preceding prototype's Unicode handling and SSR byte-limit ledger.

The experimental head writer now propagates its flush promise. A hand-built parent waits for that
head completion before rendering body children. On Node and Bun, the deliberately blocked receiver
holds the first head chunk while both actual compiler-generated sibling tasks have started. No
opening body or child HTML reaches the receiver until it accepts the head.

Six cases pass across the two runtimes: successful drain, cancellation, and transport rejection.
Successful drain produces the same complete ordered HTML. Cancellation and rejection complete
without opening the task gate or accepting the blocked head, preserve the appropriate error, and
dispose both distinct prepared children exactly once. Host ancestry returns to an empty stack.
The harness owns and clears its deadline timer and releases its fixture resources in cleanup.

Two additional capacity probes, one per runtime, expose an unfinished compiler contract: with a
one-byte threshold, the first static write blocks, but the next static write is still attempted.
The sink correctly rejects this as continuation through backpressure. This is an expected test of
the prototype limitation, not proof that capacity backpressure is implemented correctly end to end.

## Consequence for compiler integration

Waiting only at completed heads or pending children cannot satisfy arbitrary sink backpressure.
Generated write stages must preserve their character-accounting result and suspend before issuing
the next output operation whenever a write fills the sink. String sinks should return immediately;
stream sinks may return a pending drain. The same ordered writer must consume either result, with
cleanup ownership retained across the suspension. Existing operation helpers currently discard
the publication result, so changing only the transport wrapper is insufficient.

This experiment still uses a hand-built parent and compiler-generated children adapted to the
experimental output argument. The public stream adapter, compiler stage generation, hydration,
required component boundaries, and production byte sink are not integrated. The pressure wrapper
is a correctness prototype, not an optimized buffer pool. No throughput, HTTP, browser, or React
comparison is claimed. Production and its retained benchmark artifacts remain unchanged.

The evidence archive contains both sink layers, writer patch, fixture, harness, raw traces,
selected byte-accounting source, and a verified SHA-256 manifest. Built workspace packages are
required by the fixture imports. The overall goal remains incomplete.
