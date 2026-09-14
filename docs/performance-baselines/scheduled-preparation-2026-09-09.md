# Scheduled sibling preparation

Date: 2026-09-09. Retained source change in the shared SSR renderer.

Program execution previously filtered its completed values into a new component-reference array.
Sibling preparation then allocated another array even when every reference was synchronous.
It also built an execution-blueprint object and normalized construction props before consulting the
component's scheduling classification. This work happened in both string and streaming rendering.

The retained implementation accepts ordered program values directly, skips text and child arrays,
and creates an ownership list only after scheduled work is prepared. It reads the immutable server
contract before constructing a blueprint or materializing props. Synchronous component props are
left for that component's own rendering. Scheduled frame creation, sibling activation order,
deduplication, error retention, and disposal of unconsumed preparations retain the existing behavior.

This is an internal allocation and preparation improvement. It does not add a second renderer,
change the emitted ABI, integrate the experimental direct writer, or enable early head flushing.

## Hypothesis and observed work

Removing repeated empty arrays, redundant reference-list scans, and unnecessary construction
preparation should reduce allocation and dispatch costs without changing completed output. No
minimum percentage was required and no numeric gain was preregistered.

Untimed instrumentation confirms the same preparation call and component-reference counts before
and after the change. Both Node and Bun, and both output modes, show:

| Document | Preparation calls | Component references | Arrays removed | Unnecessary construction attempts removed |
| --- | ---: | ---: | ---: | ---: |
| Small | 16 | 5 | 32 | 5 |
| Large | 109 | 98 | 218 | 98 |

These are counted code paths and allocation sites, not sampled allocation bytes or measured garbage
collection savings. The benchmark components do not need scheduled preparation, so the final
ownership-array and construction-attempt counts are zero for these fixtures. Existing compiled
sibling tests independently exercise actual scheduled work.

## Paired measurements

The first variant removed the filtered array and made ownership storage lazy. It improved several
cells but slowed large Bun streams in both pairs. The refined variant additionally checks compiler
scheduling classification before building construction inputs. It is retained for the reduced
work and the corrected timing of synchronous prop evaluation. Its timing results are mixed,
particularly for large string workloads; they do not establish a uniform throughput gain.

Each variant has 32 fresh production-mode processes: Node/Bun, string/consumed stream, small/large,
two reversed-order pairs, and before/after. Total: 64 populations. Each performs 5,000 warmups and
12,000 measured renders. Both variants compare with the preceding production build,
task-selection-opt-in-current, rather than treating separately timed percentages as additive.

The fixtures contain 3 or 96 incidents and the same two scripts and two stylesheet links. Node
26.8.1 and Bun 1.4.2 use the same Node-target bundle. Streams are consumed with Response.text().
All paired complete-document hashes match and no population was discarded. An additional 32
instrumented complete-document renders preserve those hashes while checking preparation counts.

Positive values below mean longer rendering time. These are descriptive local observations, not
confidence intervals, socket throughput, browser latency, or a new React comparison.

## Lazy preparation lists

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | -0.03% | -3.02% |
| node | string | large | -1.30% | -0.73% |
| node | stream | small | -2.56% | -1.53% |
| node | stream | large | +0.45% | -0.30% |
| bun | string | small | -2.28% | -2.35% |
| bun | string | large | -4.57% | -2.23% |
| bun | stream | small | -3.18% | -2.81% |
| bun | stream | large | +1.47% | +5.69% |

## Contract-first preparation

| Runtime | Output | Document | Pair 1 time change | Pair 2 time change |
| --- | --- | --- | ---: | ---: |
| node | string | small | +0.52% | -1.76% |
| node | string | large | -1.68% | +1.66% |
| node | stream | small | -6.21% | -1.52% |
| node | stream | large | -1.43% | -5.34% |
| bun | string | small | -5.93% | -5.22% |
| bun | string | large | +4.92% | -6.94% |
| bun | stream | small | -4.47% | -3.85% |
| bun | stream | large | +1.13% | -4.16% |

## Validation and scope

The final change passes 285 SSR tests in 45 files. Existing compiled coverage verifies that three
scheduled siblings start before any are released. A new focused regression checks that preparation
can consume mixed program values without reading a synchronous component's props, even when that
reference has children and would otherwise trigger prop materialization.

SSR compilation and comparison client/Node/Bun builds pass. Test typechecking, changed-file ESLint,
source architecture, platform boundaries, frozen compiled ABI behavior, and release epoch checks
pass. The client bundle remains index-CdIXDKwS.js. The frozen current server artifact is verified
byte-for-byte against the built comparison entry, with its SHA-256 recorded in the JSON.

The package-content check initially failed when launched directly because its Windows fallback
attempted to spawn npm.cmd with execFile. Launching through npm exec --call supplies npm_execpath
and uses the existing Node installation. No package-check script or framework resolution was
changed to work around that invocation issue. Final package-check completion is recorded in the
accompanying validation summary. No new browser suite was run for this internal change; the frozen
ABI check covers representative hydration, keyed identity, tasks, and disposal.

Engineering guidance in docs/ssr-hydration.md describes contract-first preparation. Public authoring
APIs and package setup remain unchanged. No docs-app page or package README needs a new usage rule.

The broader direct-write implementation remains experimental. Compiler continuation emission,
task-dependent expression deferral, early head flushing, and complete capture/backpressure/lifecycle
integration are unfinished. This change does not demonstrate overall React parity or complete the
persistent performance goal.
