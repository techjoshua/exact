# Audit efficiency review, September 8, 2026

The subsequent [full benchmark refresh](post-efficiency-2026-09-08.md) measures rebuilt applications
against React and the other comparison frameworks, separately from the microbenchmarks below.

This follow-up evaluated all six areas of the [framework audit](../adversarial-framework-audit-2026-09-07.md).
It preserves the failures covered by that audit and retains measured improvements to task settlement,
registry composition, and protocol byte counting. Collection identity alternatives were rejected.

## Decisions across all audit areas

| Audit area                            | Result                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stable collection dependency identity | Retained the existing stable Map/WeakMap identities. Three lazy-storage variants saved memory but repeatedly slowed observed primitive-key updates by roughly 7–9%. None was retained.                                                           |
| Rollback ordering                     | Retained the previously measured last-entry restoration fast path. Native successor-Set construction and deferred lookup construction did not improve the broader cases reliably. No further ordering change was retained.                       |
| Own server registry authority         | Kept `Object.hasOwn` dispatch checks. Descriptor lookup was slower. Generated-only registry composition now copies own entries directly, and endpoint normalization avoids an intermediate Map. Explicit-name and conflict checks remain intact. |
| Cancelled paused tasks                | Parked tasks now register one cancellable microtask continuation with their scope. Their existing task abort listener releases it; a second abort listener and wait promise are unnecessary. Cancellation also fences already queued work.       |
| Rejected-await pause semantics        | Fulfillment and rejection share settlement handling without implicit async-handler promises. Both remain parked while paused and retain cancellation precedence.                                                                                 |
| Collection validation budgets         | Short strings use exact UTF-8 byte counting without an encoded buffer. Longer strings use a shared TextEncoder. Existing per-entry node limits and Map-key byte checks remain; candidate budget-arithmetic changes were reverted.                |

## Measurements

Node 26.8.1 on the same Windows workstation. Four fresh before/after process pairs alternated order.
Each scenario used three discarded warmup batches and nine measured batches per process. The table
uses the median of 36 batch means per variant; there are four independent processes, not 36
independent populations. No builds, tests, coverage, forced GC, or async hooks overlapped timed runs.
Background desktop workload was uncontrolled.

Final measured costs, in milliseconds per operation:

| Scenario                                           |   Before |    After | Change |
| -------------------------------------------------- | -------: | -------: | -----: |
| Fulfilled task await                               | 0.000522 | 0.000499 |  -4.4% |
| Paused fulfilled task await                        | 0.001024 | 0.000796 | -22.2% |
| Paused rejected task await                         | 0.001390 | 0.001189 | -14.5% |
| Cancel task while paused                           | 0.017063 | 0.015976 |  -6.4% |
| Server validation, 1,000 short ASCII Map keys      | 0.326345 | 0.021169 | -93.5% |
| Server validation, 1,000 short Unicode Map keys    | 0.341990 | 0.026701 | -92.2% |
| Hydration validation, 1,000 short ASCII Map keys   | 0.324368 | 0.023434 | -92.8% |
| Hydration validation, 1,000 short Unicode Map keys | 0.339785 | 0.026516 | -92.2% |
| Compose 1,000 generated registry entries           | 0.419352 | 0.211712 | -49.5% |
| Normalize 1,000 endpoint entries                   | 0.149740 | 0.144370 |  -3.6% |

Generated registry composition improved about 44–50% across the successive experiments. The
large string-key gains match the removal of per-key encoded buffers. Smaller timing differences
are workstation evidence, not portable guarantees. Unchanged controls also varied, including
collection creation, numeric/Set validation, and own-entry lookup, so their timing shifts are not
claimed as improvements. This review does not establish an overall SSR gain or explain the historical
eXact/React ratio change. Public charts retain their separately dated captures.

A separate async-hooks diagnostic counted two fewer promises per unpaused task await and four fewer
per paused await. Across 1,000 paused awaits, counts fell from 11,000 to 7,000, including identical
benchmark plumbing. The task path also uses one abort listener instead of two while parked.

The [evidence archive](audit-efficiency-2026-09-08.json) contains final timings, earlier diagnostic
captures, allocation probes, source/module snapshots, hashes, and final runners. Earlier diagnostic
snapshots describe rejected candidates; the final snapshot is the retained implementation.

## Correctness and integration

- All 800 reactive, core, server, and hydration tests passed.
- New cases protect queued-continuation cancellation, disposal, resume/cancel races, mixed collection
  key identity, queued-sibling node budgets, misleading Map sizes, prototype-shaped endpoints, and
  UTF-8 equivalence across Unicode, lone surrogates, and the short-string threshold.
- Frozen 0.5.0 compiled ABI checks passed without regenerating fixtures. The new framework helpers
  are additive; compiler-emitted signatures and artifact semantics are unchanged.
- Test-source typechecking, source architecture, JSDoc, changed-file lint, package-content checks,
  and platform-boundary bundling passed.
- Docs typechecking, all ten docs tests, and the production build passed. A freshly owned Vite
  development server passed browser navigation, theme interaction, and overlay/error/HTTP checks,
  then closed with its compiler resources.

The first docs-test invocation overlapped target regeneration and encountered a temporarily absent
generated core module. It passed after generation completed. Dependent app checks must follow target
generation sequentially. Existing user development servers were left running.
