# Append-built positional publication, September 10, 2026

Status: isolated experiment, not integrated. Production remains unchanged.

## Hypothesis

The generic positional validator constructs arrays with a fixed initial length
and assigns cells by index. This experiment starts with empty arrays and appends
each successfully validated cell instead. It tests whether construction and the
resulting array representation improve subsequent JSON serialization together.
An earlier serialization-only packed-copy probe showed little benefit, but did
not include this construction change. The expected benefit is modest because
the full renderer and generated projectors remain unchanged.

Validation order, live ownership checks, limits, failure sentinels, and ancestry
cleanup are unchanged. No request data or hydration script is cached. Generated
projectors still preallocate arrays; this is specifically the generic path.

## Focused results

Sixteen fresh production processes use Node 26.8.1 and Bun 1.4.2, small
(3-incident) and large (96-incident) documents, 50,000 warmups and 20,000 measured
encoded renders. Both orders are run. Workers execute sequentially at
below-normal priority while the user uses the PC. The portable Node artifact is
used on both runtimes. This is not native Bun HTTP throughput.

Each render produces a string and consumes it through Response.text(). Final
document hashes match within each scenario across all populations. Complete
application-owned documents include four asset tags. Means in microseconds per
encoded render, lower is better:

| Runtime | Document | Current | Append-built | Elapsed change |
| --- | --- | ---: | ---: | ---: |
| v26.8.1 | small | 52.99 | 52.25 | -1.4% |
| 1.4.2 | small | 36.66 | 35.49 | -3.2% |
| v26.8.1 | large | 219.32 | 204.00 | -7.0% |
| 1.4.2 | large | 281.47 | 296.47 | 5.3% |

Both orders favor the candidate on Node and on the small Bun case. Both large
Bun comparisons favor the current implementation. The candidate is not adopted
because the large Bun regression conflicts with the cross-runtime objective.

The raw populations matter more than the aggregate: changes in machine load
can affect elapsed and CPU measurements. These results do not establish an HTTP
capacity improvement or a new comparison with React. No allocation profile was
collected in this batch, so less GC or lower allocation cannot be inferred.

The fixture parity checks are supplemented by 24 comparisons with three
concurrent requests carrying distinct titles, across both runtimes, document
sizes, and string/stream modes. Every third otherwise-ready sink checkpoint is
forced to suspend. These checks cover output parity and continuation behavior,
not the complete serialization contract. Package and browser suites have not
been rerun for this unintegrated experiment.

The next experiment can construct compiler-projected record arrays as literals
after validating their cells. That removes intermediate indexed writes on the
generated path while retaining the current read and validation order. It must
be measured separately before combining changes or modifying compiler source.

## Evidence

The adjacent evidence ZIP includes builder, runner, worker, raw timing results,
control and candidate artifacts, concurrency checker and results, fixed fixture,
and a SHA-256 manifest. The control artifact has SHA-256
`2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.
