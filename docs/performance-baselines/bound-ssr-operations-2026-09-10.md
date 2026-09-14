# Module-bound SSR operation helpers

Status: scratch prototype not adopted. Longer confirmation retains small Node
improvements but reverses the short Bun large-string improvement into a regression.

## Hypothesis and implementation

Generated writers receive a shared operations object and call its methods through
a parameter. The hypothesis was that module-level bindings could make those calls
easier to optimize, without changing preparation, validation, traversal or sink
behavior. The experiment replaces 201 property references with 15 bindings to the
existing frozen operations object's members in each Node/Bun artifact. It changes
neither operation bodies nor writer parameters/continuation structure.

The prototype uses artifact-local constants, not new package exports or a deployed
compiler ABI. Bound helpers are stateless with respect to their JavaScript receiver.
A production design would require explicit compiler/runtime imports and review of
helper ownership, initialization and ABI, rather than depending on bundle internals.

## Validation

Sixteen complete-document comparisons pass per runtime, covering string/stream,
assets/content variants and a missing route. Twelve forced-pressure comparisons
per runtime also pass: a pending drain after every write, small/large documents,
successful string/stream completion, and string drain failures at several writes.
Writes before drain settlement fail in the harness. Output, write order and errors
match current behavior. This is not package, browser or full compiler acceptance.

## Initial timing screen

Forty-eight fresh production processes cover two runtimes, two modes, two sizes,
three implementations and two reversed orders. Each uses 5,000 warmups and 5,000
measured renders, below-normal priority. Both runtimes load the portable server
entry. Streams are consumed with Response.text. All eXact document hashes match.
PC workload may vary. Means are microseconds per complete render/consumption.

| Runtime / mode | Fixture  | Current | Bound helpers |  React |
| -------------- | -------- | ------: | ------------: | -----: |
| Node string    | Standard |   30.25 |         31.50 |  22.72 |
| Node string    | 96 items |  136.62 |        133.88 | 131.73 |
| Node stream    | Standard |   51.68 |         51.49 |  68.40 |
| Node stream    | 96 items |  174.38 |        167.52 | 324.51 |
| Bun string     | Standard |   33.23 |         32.49 |  31.59 |
| Bun string     | 96 items |  199.26 |        193.90 | 181.08 |
| Bun stream     | Standard |   49.12 |         48.14 |  52.79 |
| Bun stream     | 96 items |  237.89 |        240.03 | 265.56 |

Node standard-string candidates vary from 33.25 to 29.75, while controls are 30.12
and 30.39. A longer confirmation was warranted instead of treating that mean as
decisive or adopting the apparent large-fixture gains immediately.

## Longer string-only confirmation

Twenty-four fresh processes use 50,000 warmups and 20,000 measured renders, with
the same two reversed orders, fixtures, controls and priority. These are separate
populations; differences from the first screen are not implementation changes.

| Runtime | Fixture  | Current | Bound helpers |  React |
| ------- | -------- | ------: | ------------: | -----: |
| Node    | Standard |   22.08 |         21.74 |  21.86 |
| Node    | 96 items |  132.08 |        129.52 | 135.45 |
| Bun     | Standard |   28.18 |         27.82 |  31.50 |
| Bun     | 96 items |  213.23 |        221.67 | 209.45 |

Node large-string improves in both orders: 133.30 to 130.45 and 130.87 to 128.60.
Bun large-string gets slower in both: 215.74 to 223.01 and 210.71 to 220.34.
The short-run Bun gain did not survive longer warmup/measurement. These results
do not isolate JIT behavior, CPU state or allocation as the cause, but do not support
adopting this form across both runtimes. The small Node gains are retained as
evidence, not discarded because they miss an arbitrary percentage threshold.

No HTTP improvement is established. The next distinct hypothesis would preserve
the operations-object receiver while referring to a fixed module-level object,
separating constant lookup from extracting individual function bindings. That is
not implemented or benchmarked in this report.

The adjacent archive includes both timing runs (72 populations), checks, builder,
artifacts, logs, fixture and verified SHA-256 manifest. All benchmark processes
exited; only the user's Codex Node remained. Production and public documentation
remain unchanged; the overall React throughput objective remains unresolved.
