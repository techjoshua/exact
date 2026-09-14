# Short projectors with existing Set ancestry, September 10, 2026

Status: rejected artifact experiment. Production source and canonical application artifacts
remain the retained static-input reuse implementation.

## Audit and hypothesis

The earlier projector-small report left an unexecuted follow-up: permit short-array projectors
only when ancestry already uses a native Set. Unlike lowering the cutoff for all arrays, this
condition avoids forcing early conversion from the shallow ancestor tracker. It preserves the
version-one native Set contract, live ownership checks, validation budgets, and cycle checks.

An instrumented current artifact confirms zero additional calls for the small document and
96 additional calls per large document, on both Node and Bun. Each audit executes one warmup
and one measured render, so its raw counter is 192 for the large document. The eligible nested
arrays contain incident comments with four fields. This justified a hypothesis of 1-3% faster
large-document rendering, with no expected small-document benefit.

## Measurement

The timed artifact contains the condition change without instrumentation. Thirty-six fresh
production processes compare retained eXact, candidate eXact, and React in two reversed orders
on Node and Bun. Each uses 5,000 warmups and 10,000 measured renders of the 96-incident document
with four asset tags. Both applications render complete owned documents. Encoded mode consumes
the string through Response.text(), and stream mode fully consumes the framework stream.
Complete eXact document hashes match. Units are microseconds per render, lower is better.

| Runtime | Mode    | Current | Candidate |  React |
| ------- | ------- | ------: | --------: | -----: |
| node    | string  |  167.83 |    169.40 | 134.24 |
| node    | encoded |  209.66 |    206.86 | 180.73 |
| node    | stream  |  195.44 |    196.47 | 330.07 |
| bun     | string  |  212.58 |    215.99 | 182.99 |
| bun     | encoded |  216.11 |    224.03 | 203.92 |
| bun     | stream  |  294.13 |    301.38 | 264.84 |

Node string rendering is slower in both orders. Bun string, encoded, and streaming means also
regress; only Node encoded mean improves, with inconsistent per-population direction. The
candidate is rejected without production changes. No minimum gain threshold, HTTP capacity
claim, or statistical confidence claim is used. These short shared-machine measurements do
not establish a universal property of projectors, but do not support adopting this condition.

Because the candidate is discarded before source integration, full package and browser suites
were not rerun. The audit and benchmark establish fixture reachability and output parity, not
general contract correctness. Raw captures, runners, instrumented and timed artifacts, and the
retained eXact control are preserved in projector-ready-2026-09-10-evidence.zip.

This resolves the unexecuted follow-up in projector-small-2026-09-09.md. The overall objective
remains unmet. The latest HTTP comparison remains static-server-invocations-2026-09-10.md.
