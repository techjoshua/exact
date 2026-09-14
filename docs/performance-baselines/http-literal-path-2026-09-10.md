# URL pathname representation and hydration JSON

Status: diagnostic lead established, not a production fix or paired throughput gain.

## Evidence and hypothesis

The actual current hydration payload includes the requested pathname. A Node
26.8.1 DebugPrint check shows the literal /incidents/inc-101 as an internalized
one-byte string, while extracting the same value with URL.pathname produces a
sliced one-byte string. Equal values and array maps therefore did not exclude a
relevant representation difference in the prior payload audit.

The version-specific V8 fast JSON encoder handles sequential, external and thin
string representations in TrySerializeSimpleObject; sliced strings reach its
slow-path result. This supports testing whether the URL-derived pathname contributes
to the observed encoding penalty. It does not prove a precise cost in this workload.
[Node 26.8.1 V8 source](https://raw.githubusercontent.com/nodejs/node/v26.8.1/deps/v8/src/json/json-stringifier.cc)

## Diagnostic substitution

A copy of the split-region HTTP worker supplies the fixture's literal pathname to
rendering instead of URL.pathname. All application components, data preparation,
hydration, adapter work and response output still run. This is fixture-specific
diagnostic scaffolding, not an acceptable production router change or route cache.
Only the Node eXact participant is measured. The renderer artifact is unchanged
from the split-region trace.

Two fresh production workers use the same ten-second HTTP warmup, warmed loop /
five-second HTTP / warmed loop sequence, one-in-64 region sampling, two drivers at
concurrency 16 each, and below-normal priority. PC workload may vary.

| Capture | Native JSON microseconds per sampled HTTP document |
| --- | ---: |
| Earlier URL-path split trace, mean of two workers | 5.06 |
| Literal-path worker 1 | 3.06 |
| Literal-path worker 2 | 3.19 |

These are separate worker populations, not an interleaved paired experiment. The
decrease is consistent with the representation hypothesis but does not establish
its causal magnitude or an HTTP capacity improvement. A same-worker comparison
using a dynamically copied pathname is warranted before production changes.

Literal-path diagnostic rates are 8,652.74 and 8,304.33 RPS. All 84,877 measured
responses are valid with zero errors. Each response has the expected complete
4,672-byte document identity. This is not a React comparison or baseline refresh.
Instrumentation alters execution, and the remaining gap cannot be assigned solely
to pathname representation.

The adjacent archive includes the worker/runner, unchanged instrumented artifact,
raw capture and summary, fixture, original artifacts, standalone string-layout log
and verified hashes. No production source or public documentation changed.
