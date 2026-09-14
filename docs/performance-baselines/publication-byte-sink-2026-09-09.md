# Byte publication sink prototype

Date: 2026-09-09. Experimental sink and integration checks; production unchanged.

The early-publication prototype now has a synchronous byte sink that reuses SsrOutputBuffer's
incremental UTF-8 output-limit ledger. It stages strings, encodes completed spans with TextEncoder,
flushes at a configurable byte threshold (8,192 by default), and supports explicit head/before-await
flushes. A threshold triggers publication; it is not a strict maximum chunk size when one write is
larger than the threshold.

A trailing high surrogate is held across ordinary flushes until the next code unit determines
whether it forms a pair. Final completion accounts for and encodes an unmatched tail. Limit and
publication failures clear pending data and close the sink; destroy is idempotent and prevents later
writes. Already-published bytes are owned by the receiver and cannot be revoked.

Each runtime passes 364 split/threshold cases: seven thresholds (1, 2, 3, 4, 8, 2,048, and 8,192 bytes)
times every split position of a document containing accented text, CJK text, a surrogate pair, and
unpaired surrogates. Concatenated emitted bytes equal Buffer.from of the complete source string,
and the reported byte count matches. Additional cases verify a cross-write pair exceeding the
limit, an over-budget unmatched final surrogate, publisher failure, and idempotent destruction.

Four integration cases reuse the real scheduled-child early-head test across Node/Bun and
success/cancellation, now with encoded byte chunks and a 1,024-byte output limit. The completed head
and opening body are published before task settlement. Success produces the same ordered document;
cancellation publishes no later body content, and both children are disposed once.

## Limitations

This prototype measures correctness, not performance. It counts the staged string with
Buffer.byteLength after each write, which may rescan pending text. That deliberately simple policy
is not an optimized allocation or byte-accounting claim. It creates an encoded array per flush,
does not pool buffers, and does not implement asynchronous backpressure. It is not connected to
the public stream adapter. The fixture still disables hydration markers and omits hydration data;
the parent remains a hand-built experimental writer.

The next step needs a transport-aware sink contract that lets the shared traversal suspend on
actual backpressure while retaining these byte and lifetime guarantees. Compiler stage emission,
required boundaries, hydration-at-tail ordering, and production integration remain incomplete.
No new throughput, browser timing, React comparison, or production change is claimed.

The evidence archive contains sink source, audits, raw split results, integration traces, input
writer/fixture, selected byte-accounting sources, and a verified SHA-256 manifest. Built workspace
packages are required to run it.
