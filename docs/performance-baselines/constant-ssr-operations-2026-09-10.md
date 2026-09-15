# Constant operations-object lookup

Status: scratch confirmation completed. No production change or HTTP gain established.

The preceding bound-helper prototype extracted individual functions, improving Node
large-string timing while regressing Bun in longer runs. This variant instead keeps
method calls on the original frozen object through a module-level constant. It
replaces 201 references in each Node/Bun artifact without changing helper bodies,
writer arguments, continuations, sink behavior or validation. The hypothesis is
that constant lookup may aid optimization while preserving the method receiver.

Sixteen document-parity and twelve forced-pressure cases pass on each runtime.
Pressure tests pause after each write and include failures at several drain points.
Output, write order and errors match. This is not production compiler, package or
browser acceptance.

Twenty-four fresh production string-rendering processes use 50,000 warmups and
20,000 measured renders, two reversed orders, current/candidate/React, two runtimes
and standard/96-item fixtures. Workers run below normal priority. Document hashes
match. Both runtimes load the portable server entry; this is not HTTP timing.
PC workload may vary. Mean microseconds per complete string render:

| Runtime | Fixture  | Current | Constant object |  React |
| ------- | -------- | ------: | --------------: | -----: |
| Node    | Standard |   21.69 |           23.01 |  21.34 |
| Node    | 96 items |  135.77 |          128.25 | 134.07 |
| Bun     | Standard |   27.19 |           27.35 |  31.26 |
| Bun     | 96 items |  216.71 |          212.29 | 203.79 |

The large-fixture averages improve, but Node standard-string is slower. This is
mixed evidence, not a demonstrated cross-runtime throughput improvement. Keep the
prototype for possible follow-up, without changing production imports or ABI.
Further work shifted to a more concrete input-representation hypothesis uncovered
during this run: the URL pathname included in hydration is a sliced string on Node.
That separate diagnostic is recorded in http-literal-path-2026-09-10.md.

The adjacent archive preserves builder, both artifacts, checks, timing worker and
runner, all 24 measurements, log, fixture, original artifacts and a verified hash
manifest. All owned benchmark processes exited.
