# Document-host completion experiment, September 10, 2026

Status: rejected after prototype and rebuilt measurements. Production source and package output
are restored to static-input reuse without this experiment. Evidence remains archived.

## Hypothesis and design

The document-host branch of renderProgramWriter created cleanup and mapping callbacks even
when readiness, rendering, and head flushing all completed synchronously. Hypothesis: removing
those callbacks could reduce small-document time by roughly 0.5-2%, with a smaller proportionate
effect on large documents. The candidate retains the same renderer and sink interface. It uses
direct completion when synchronous and the existing cleanup mechanism for pending work and errors.
Head ancestry remains active until its flush settles. It does not enable early head publication
in the public document stream.

## Prototype evidence

The current artifact is the integrated static-input reuse build. Both frameworks render full
application-owned documents with four asset tags. Each fresh production process uses 5,000
warmups and 10,000 measured iterations. Two reversed variant orders cover Node/Bun, string,
encoded string, and fully consumed streaming for small and 96-incident documents. Complete
document hashes match between eXact variants. Units are microseconds per render, lower is better.

| Runtime | Mode | Size | Current | Candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | small | 33.27 | 32.43 | 22.47 |
| node | string | large | 167.12 | 162.67 | 131.80 |
| node | encoded | small | 51.38 | 49.81 | 33.18 |
| node | encoded | large | 201.92 | 207.67 | 181.34 |
| node | stream | small | 54.68 | 54.38 | 68.51 |
| node | stream | large | 198.07 | 200.03 | 335.37 |
| bun | string | small | 37.59 | 36.83 | 32.29 |
| bun | string | large | 217.96 | 212.22 | 184.79 |
| bun | encoded | small | 38.92 | 38.09 | 38.00 |
| bun | encoded | large | 222.77 | 223.23 | 203.57 |
| bun | stream | small | 52.91 | 53.05 | 52.51 |
| bun | stream | large | 296.01 | 301.43 | 268.66 |


String means improved across both runtimes and document sizes. Encoded and streaming results
are mixed. In particular, large Node encoded candidate populations were 199.02 and 216.31
microseconds; large Bun stream candidate populations were 309.24 and 293.62. Neither sample
is discarded, and no cause for the variation is established. These are renderer measurements,
not HTTP throughput, and do not establish a general win over React.

Eight additional full-response checks passed with readiness forced to return promises after
every write and with an asynchronous flush. Source SSR tests passed: 340 tests in 53 files.
Added cases cover synchronous throws and rejected promises during readiness, writer execution,
and head flushing, verifying error identity, invocation count, and balanced host ancestry.

## Build validation history

Test typechecking and the SSR TypeScript build passed. The first isolated app build was found
to contain the old runtime because the native package compilation step does not emit this
TypeScript file. No rebuilt measurements used that artifact. After running tsc6 -b packages/ssr,
the rebuilt app was checked for the new finishHostedOutput helper. The rebuilt results below
led to rejection before broader browser validation was warranted. The preceding
[HTTP comparison](static-server-invocations-2026-09-10.md) measures static-input reuse only.

Prototype scripts, artifacts, raw captures, and current source snapshots are preserved in
host-completion-2026-09-10-evidence.zip. Completed rebuilt measurements are recorded separately
below.

## Rebuilt comparison

The corrected source build completed the same 72-population matrix, preserving complete
document hashes. These measurements are separate from the prototype window:

| Runtime | Mode | Size | Current | Rebuilt candidate | React |
| --- | --- | --- | ---: | ---: | ---: |
| node | string | small | 33.11 | 33.56 | 22.37 |
| node | string | large | 166.49 | 166.14 | 132.19 |
| node | encoded | small | 50.23 | 49.74 | 32.93 |
| node | encoded | large | 202.11 | 199.73 | 179.18 |
| node | stream | small | 54.43 | 52.85 | 67.27 |
| node | stream | large | 191.48 | 192.41 | 334.49 |
| bun | string | small | 36.96 | 36.08 | 32.10 |
| bun | string | large | 213.53 | 213.11 | 182.57 |
| bun | encoded | small | 38.98 | 37.42 | 37.73 |
| bun | encoded | large | 221.30 | 222.64 | 201.31 |
| bun | stream | small | 52.12 | 54.41 | 52.32 |
| bun | stream | large | 302.07 | 293.83 | 272.76 |


The rebuilt results remain mixed. Small Bun string and encoded means improve, but Node small
string and Bun small stream regress. Large results fluctuate across populations. The added
branching is not justified by a consistent gain across the target workloads, so this version
is rejected. No minimum improvement threshold is used. No canonical application or public
performance chart incorporates it.

After restoring the original completion implementation and rebuilding TypeScript and the isolated
application, the complete artifact hash again matches the retained static-input reuse build:
A8006EFF178F970AF9F4FE9C1D3F5124BDF2B244C4BDF7085A62ECDFC972995E.
All ten focused writer tests pass. The new failure cases remain because they protect the stable
ancestry and error contracts independently of this implementation. The restored source, build
logs, and test result are preserved in host-completion-restored-2026-09-10-evidence.zip.

The adjacent host-completion-rebuilt-2026-09-10-evidence.zip preserves this runner, capture,
artifact, and successful TypeScript build/typecheck logs. All timed processes completed.
