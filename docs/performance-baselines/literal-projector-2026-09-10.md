# Literal-array projectors, September 10, 2026

Status: isolated experiment, not integrated. Production source and canonical
artifacts remain unchanged.

## Hypothesis and scope

Construct each generated positional record as an array literal after reading and
validating its cells, rather than preallocating an array and writing each index.
This removes indexed writes and may improve the array representation consumed by
JSON. It avoids the array-growth cost of the preceding generic append experiment.
The expected gain is modest, since all validation and nested traversal remain.

Seven generated projectors change in the isolated artifact. Field reads,
ownership checks, failure sentinels, limits, and finally-based ancestry cleanup
retain their order. Generic projection is unchanged. This is not a cache or a
separate renderer. The large document reaches generated record projection;
short lists retain the existing interpreter threshold.

## Focused measurements

Eight fresh production processes run the 96-incident full application document,
including four asset tags, through complete encoded string rendering. Each
process warms 50,000 renders and measures 20,000. Node and Bun each use both
orders, sequentially at below-normal priority while the user uses the PC.
Both use the portable Node entry. These are not HTTP or native Bun adapter
measurements, and React was not rerun.

Mean microseconds per render, lower is better:

| Runtime | Current | Literal projectors | Elapsed change |
| ------- | ------: | -----------------: | -------------: |
| v26.8.1 |  210.32 |             205.17 |          -2.4% |
| 1.4.2   |  285.79 |             285.58 |          -0.1% |

Both runtimes' pair directions disagree: the first candidate is slower, the
second faster. Workload changes
limit causal precision, and these means do not establish a production win.
The experiment is not adopted. No allocation or GC improvement is claimed.

## Correctness and evidence

All final measured document hashes match. Another 24 full-output comparisons
cover small/large documents, Node/Bun, string/stream, three concurrent requests
with distinct titles, and forced suspension at every third otherwise-ready sink
checkpoint. All pass.

The seven transformed projectors also match interpreter success output or
failure paths in 147 cases per runtime: ordinary data, missing/extra fields,
getters deleting a later field, cycles, nonfinite values, null prototypes,
and reduced node/depth limits. These checks use isolated diagnostic exports.
They do not replace compiler integration, package, or browser validation if a
future implementation is adopted. Those broader suites were not rerun here.

The adjacent evidence archive contains builders, workers, raw measurements,
control/candidate artifacts, contract and suspension checks with results, the
fixture, and a SHA-256 manifest. Control SHA-256:
`2ebf7fed2ee0dc972095976bf55230ccc924a120251a463af26838e8ebb2cd18`.

Together with the generic append experiment, this result weakens array storage
construction as a cross-runtime solution to hydration publication overhead.
The next audit should examine which publication values require projection at
all and whether any repeated traversal can be removed without weakening the
serialization boundary. The overall React comparison goal remains unmet.
