# Retained direct server map carriers

Date: 2026-09-09. Retained improvement; overall React parity remains unmet.

## Problem and change

The server-only directSsrMap helper created a generic opaque keyed-child receipt per item, including
property definitions, frozen metadata, and a private WeakMap payload. The server already has a
prepared keyed-child carrier. Both representations reach the same keyed rendering method.

The helper now uses createPreparedServerKeyedChild for each item. It retains the outer fragment,
fragment key/domain, collection materialization, render-before-key evaluation, key normalization,
and renderer/task ownership. It does not request the compiler-only wrapper-elision proof flag.
The helper never supplied an ownerScope to the old receipt constructor. No new helper signature,
wire representation, public API, second engine, or platform-specific branch is introduced.

Engineering documentation was updated. Public docs-app usage is unchanged, so no public page or
README was changed for this internal implementation detail.

## Workload and hypothesis

The compiled comparison shell uses this.map for script and stylesheet lists. Earlier focused
benchmarks supplied empty client tags, leaving both lists empty and failing to exercise per-item
carrier creation. This experiment supplies two module scripts and two stylesheet links through
the existing document options. This is a distinct fixture, not a replacement for the empty-tag
baseline or a benchmark-only application rewrite.

The hypothesis is that replacing several generic allocations per mapped item with the existing
direct carrier improves rendering of populated lists. No numerical gain was preregistered.

## Rebuilt artifact results

After the prototype showed string gains, the source implementation was built and compiled, then
the comparison client, Node server, and Bun server were rebuilt. The Node-target artifact was
frozen as direct-map-current.mjs and compared with callback-current.mjs using the same portable
bundle on both runtimes. This checks the rebuilt implementation rather than only an edited bundle.

Sixteen fresh processes per batch: Node/Bun, string/consumed stream, two reversed-order pairs per
cell. Each population uses NODE_ENV=production, 5,000 warmups, 12,000 measured renders, three
incidents, complete application-authored documents, and the four asset tags. Streams are consumed
with Response.text(). Prototype and rebuilt batches both preserve all paired full-document hashes.

Positive means longer rendering time. These are two local pairs, not confidence intervals.

| Runtime | Mode | Rebuilt pair 1 time change | Rebuilt pair 2 time change |
| --- | --- | ---: | ---: |
| node | string | -6.82% | -10.43% |
| node | stream | -10.33% | +0.58% |
| bun | string | -7.97% | -6.89% |
| bun | stream | -4.91% | -3.69% |

String gains repeated in both runtimes across prototype and rebuilt batches. Rebuilt Bun streams
improved in both pairs; Node streaming showed one gain and one near-flat regression. The code is
retained for the allocation reduction and consistent string benefit on the affected workload.
No minimum percentage threshold was used. Absolute timings varied between batches, so only paired
changes are interpreted. No new HTTP capacity, React comparison, or browser timing is claimed.

## Validation

- SSR suite: 45 files, 283 tests passed. New rendering coverage checks keyed intrinsic output order
  and render-before-key evaluation through the shared renderer.
- SSR TypeScript build and native package compilation passed; repository test typecheck passed.
- ESLint for both changed source/test modules passed.
- Source architecture and platform-boundary checks passed.
- Compiled ABI check passed, including frozen artifact client tasks, reactive updates, keyed
  identity, SSR, hydration, and disposal.
- Comparison client plus Node/Bun server builds passed.
- Browser correctness: 56 checks passed, 14 each for Node/Bun and string/stream, including both
  eXact and React. These use actual built client assets and owned server cleanup.

The API still rejects missing keys through the same helper rule and renders each keyed value via
the existing target method. No released fixture was regenerated. The archive includes source,
fixed fixture, frozen bundles, runners, raw results, browser logs, and hashes. Other validation
commands completed successfully in the tool transcript; they were not redirected to log files.

The most recent overall HTTP comparison predates this change and used empty asset tags. It remains
the appropriate historical comparison; this affected-path gain cannot be applied to those RPS
numbers. Further work is required to meet the full performance objective.
