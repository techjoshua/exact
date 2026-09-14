# Current string renderer CPU profiles

Date: 2026-09-09. Diagnostic investigation; production unchanged.

The preceding turn reported status without new implementation evidence. This follow-up verified
the current participant SHA-256 against the retained text-surroundings artifact and collected six
fresh Node CPU profiles: eXact and React, each with three incidents without assets, three incidents
with four assets, and 96 incidents with four assets. Each production process performs 5,000 warmups
and 50,000 measured full-document string renders. React executes from its participant directory,
resolving React DOM 19.2.0. All six final document hashes match the corresponding earlier comparison.

These CPU profiles include startup, warmup, and measurement. Percentages are sampled self time,
not allocation bytes or inclusive bucket totals. Timings under the profiler are diagnostic and do
not replace the unprofiled paired comparison. One process per cell does not establish variance.

| Framework | Scenario | GC self time | Prominent serialization work |
| --- | --- | ---: | --- |
| React | assets | 5.4% | escapeTextForBrowser: 5.1% |
| React | empty | 2.9% | escapeTextForBrowser: 5.0% |
| React | large | 2.8% | escapeTextForBrowser: 12.2% |
| eXact | assets | 10.7% | validatePositionalValue: 4.7%, serializeJson: 4.3% |
| eXact | empty | 11.9% | validatePositionalValue: 5.1%, serializeJson: 4.2% |
| eXact | large | 10.0% | validatePositionalValue: 4.9%, serializeJson: 6.4% |

## Consequences for the next experiment

The profile supports continued attention to allocation and hydration work, but does not prove
which allocation site causes GC. The string-result code creates request-local accessor closures,
hidden chunk properties, and a second hydratable wrapper. Source inspection confirms that these
are real costs; replacing them requires preserving lazy materialization and result semantics.
The earlier single-result experiment already tested a writable single-chunk property and produced
mixed Bun results. Repeating it unchanged is not warranted.

A distinct candidate is shared accessor implementations with request-owned result storage,
preserving lazy getters and chunk ownership. Hypothesis: eliminating per-result getter closures
could save roughly 1-3% of small-document string time; this is a forecast, not a measurement.
Before implementation, verify enumerable own-property behavior, mutation semantics, and retention
of the underlying chunk arrays. A prototype must compare Node and Bun, string and consumed stream,
and retain full-document hashes. Do not remove serialization checks to manufacture that gain.

The asset shell delta alone does not prove asset traversal is the dominant gap. Both applications
parse their build-generated tag inputs and render their own shell. The current profiles provide
attribution clues, not a causal subtraction of asset costs across separate processes.

No production edit or new browser result is claimed. The shared direct-to-sink traversal and
early independent shell publication remain incomplete, and React parity remains unmet.

Raw CPU profiles, measurements, summary, scripts, and a SHA-256 manifest are in the adjacent
evidence ZIP. The existing text-surroundings report remains the unprofiled performance reference.
