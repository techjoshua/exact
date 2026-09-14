# Collection audit efficiency, September 8, 2026

The [adversarial audit](../adversarial-framework-audit-2026-09-07.md) corrected observable failures,
including lost subscriptions, overwritten authoritative values, and changed collection iteration order.
Those guarantees remain intact. This follow-up reduces the work needed to restore a deleted last entry.

## Retained change

When a deleted entry had no successors, rollback can append it directly. It no longer copies and
rebuilds the entire Map or Set. Newer unrelated insertions remain intact, as do the existing mutation
ownership checks. Deletions with successors retain the original ordering-anchor algorithm.
Capturing anchors still scans the collection, so the complete transactional operation remains linear.
Ordinary deletion is unchanged.

Four fresh before/after process pairs alternated order under Node 26.8.1. Each scenario used ten warmups
and fifty measured operations per process. Each operation started with a fresh collection, constructed
outside the timed interval, so head, middle, and tail positions stayed consistent. Checks verified size
and restored iteration order after each operation. No correctness suite ran alongside measurement.
Desktop workload was uncontrolled. These are local microbenchmarks with no observers, not SSR or React comparisons.

Medians across 200 operations per variant for 10,000-entry collections, in milliseconds:

| Collection | Deleted position | Before rollback | After rollback | Change |
| ---------- | ---------------- | --------------: | -------------: | -----: |
| Map        | Head             |          0.8015 |         0.8004 |  -0.1% |
| Map        | Middle           |          0.7751 |         0.7784 |  +0.4% |
| Map        | Tail             |          0.6364 |         0.0674 | -89.4% |
| Set        | Head             |          0.5612 |         0.5494 |  -2.1% |
| Set        | Middle           |          0.5409 |         0.5389 |  -0.4% |
| Set        | Tail             |          0.4121 |         0.0678 | -83.5% |

The large tail improvement is consistent with removing the rebuild. Small differences in unchanged
paths are not established gains or regressions. The [evidence archive](collection-audit-efficiency-2026-09-08.json)
includes individual timings, both collection sizes, committed deletions, exact runtime overrides, and runners.

## Rejected candidate

Capturing successors in an array and constructing their membership Set only during rollback made
successful head/middle deletions cheaper. However, measured head/middle rollback cost rose approximately
5–17% at 10,000 entries. That tradeoff was rejected. The archive retains this experiment separately.

## Validation and scope

All 173 reactive tests passed, including four additional Map/Set cases covering tail restoration with
newer insertions and NaN keys with a removed successor. The three task-pause regressions and nine
server registry/budget regressions also passed. Frozen 0.5.0 ABI checks passed without regenerating fixtures.

The audit's cancellation and validation checks still protect their original failure boundaries. No
dispatch, task, or serialization check was removed. This optimization does not resolve the historical
eXact/React performance shift identified in the [SSR isolation report](audit-impact-2026-09-07.md).
