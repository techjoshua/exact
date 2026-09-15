# Derived selection fix and native benchmark follow-up

The native full-stack correctness blocker is resolved in commit `b1e7a333732c6d8eacdce1a3e3e2d4d8ac3df6c6`.
All eight native acceptance tests pass. The original application source and transport are unchanged.

## Cause and correction

A retained computed selection unwrapped its reactive object into a raw object. Compiler state assignments reconcile compatible objects in place, so the selected object's identity could stay the same while its fields changed. Consumers reading through the raw selection no longer tracked those fields. The successful claim response and updated queue therefore coexisted with a stale detail panel.

Computed selections now preserve reactive proxies. Consumers observe nested fields directly, and switching to a different reactive reference moves subscriptions even when its fields are equal. Plain calculated results retain structural equality. No deep snapshot, forced whole-component rerender, application workaround, compiler-output change, or ABI epoch change is needed.

Regression coverage includes a scope-owned computed chain with in-place reconciliation, subscription transfer between equal reactive objects, and a compiled render helper updated by an authored state assignment. The compiled helper and equal-object regressions fail against the previous runtime. Existing native tests cover hydration, server claims and comments, event-stream updates, and draft/focus preservation.

## Validation

- Package suite: 2,181 passed, 15 existing skips across 364 passing and two skipped test files.
- Focused reactive/compiler suite: 200 passed across 21 files after the final implementation.
- Native full-stack acceptance: 8/8 passed after rebuilding both participants.
- Controlled five-framework browser acceptance: 35/35 passed after rebuilding eXact.
- Application tests, test type checking, and docs verification passed.
- Published 0.5.0 artifact compatibility, ABI policy, package contents, platform boundaries, source architecture, and JSDoc checks passed.
- Reactive/DOM and framework performance checks passed.

## Native measurements

Seven fresh browser contexts per participant and 100 sequential server probes per participant, using the maintained native measurement runner on Node v26.8.1. Framework order is eXact then React Router. The runner rebuilds both production applications before timing.

| Measurement                    | eXact native | React Router native |
| ------------------------------ | -----------: | ------------------: |
| Heading readiness p50          |     63.59 ms |            66.94 ms |
| Claim completion p50           |     67.20 ms |            76.03 ms |
| Sequential server response p50 |     15.41 ms |            15.32 ms |
| Sequential server response p95 |     16.27 ms |            16.76 ms |

Heading readiness includes browser automation and visible SSR content; it is not an isolated hydration CPU measurement. Claim completion includes automation, transport, and the visible version update. Server probes include the application data path and run sequentially; they are not a capacity comparison with the controlled SSR throughput charts. These small samples establish a working native measurement lane, not a performance ranking. Build measurements use existing dependencies and caches, so the raw runner's `cleanBuildMs` label does not mean a clean-checkout install/build.

## Performance checks

The 1,000-step computed-chain median is 55.53 ms versus 55.55 ms in the preceding capture. This repeat does not establish a material regression. Individual collection tails vary; raw samples are retained rather than treated as improvements from this fix. The compiled DOM rotation and broader framework checks pass their configured budgets.

The [original controlled client and SSR capture](full-performance-2026-09-14.md) remains historical evidence, including its failed native gate and connection-refusal controls. Those chart measurements were not repeated for this focused runtime fix.

## Evidence

[Native raw samples](native-selection-fix-2026-09-14-native.json), [structured validation and performance evidence](native-selection-fix-2026-09-14.json), and [validation logs](native-selection-fix-2026-09-14-evidence.zip). Native capture metadata reports a dirty tree because unrelated untracked directories existed; tracked source was clean at the measured commit. Artifact hashes identify the rebuilt native applications.
