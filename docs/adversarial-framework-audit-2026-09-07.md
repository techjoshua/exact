# Framework adversarial audit, September 7, 2026

This audit examined framework behavior at reactive transactions, task ownership, server dispatch,
and decoded server/hydration data boundaries. It reproduced defects with regression tests before
fixing them in the owning runtime packages. Compiler lowering did not need to change.

## Confirmed findings and fixes

| Finding                                                   | Reproduction and consequence                                                                                                                                                                                                                                                 | Fix owner                                                                                                                                                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Collection dependency identity changed after deletion     | Abort a Map or Set deletion/clear, then update the restored key. Existing observers can stop receiving updates. An optimistic deletion followed by authoritative reinsertion can also lose the newer value on rollback. Clearing a Map disconnects observers of absent keys. | `packages/reactive/src/proxy/collections.ts` retains per-key dependency identity across membership changes. Object keys use weak storage.                                                        |
| Deleted entries returned in the wrong order               | Delete the first entry inside an aborted transaction. Undo appends it instead of restoring its original position, changing subsequent iteration and rendered ordering.                                                                                                       | Collection undo records ordering anchors and rebuilds from current entries, preserving unrelated newer values.                                                                                   |
| Inherited server registrations granted dispatch authority | Put an invocation contract or handler on a registry prototype and request its ID. Dispatch previously executed it despite no own registration. Inherited payload decoders were also accepted.                                                                                | Server validation and operations require own entries. Contract composition safely preserves explicitly registered names, including `toString` and `__proto__`, in ordinary serializable records. |
| Cancelled tasks retained paused continuations             | Fulfill an awaited source while its component scope is paused, then cancel. The task rejects but its scope retains the resume callback. Late fulfillment after cancellation can also enqueue work.                                                                           | Scope resume waits accept an optional abort signal and detach their callback. Task continuations check settlement before parking.                                                                |
| Rejected awaits bypassed component pause                  | Reject an awaited source while paused. Authored failure handling runs immediately while successful continuations remain parked.                                                                                                                                              | Both success and failure continuations wait for resumption; cancellation remains immediate.                                                                                                      |
| Collection validation missed or delayed budgets           | A Map with a large string key passes a small byte budget. Set validation enumerates the entire collection before enforcing a small node budget.                                                                                                                              | Server and hydration validators count Map-key bytes and enforce node capacity before enqueueing each collection entry.                                                                           |

The inherited-registration finding requires a server registry with populated prototype entries.
The caller can choose an operation ID; these reproductions do not establish arbitrary remote code
execution or a way to populate a server prototype remotely.

## Regression evidence

New regression coverage lives in:

- `packages/reactive/src/collection-rollback.test.ts`: eight collection identity, ordering, and
  authoritative-write cases.
- `packages/core/src/task-pause-cancellation.test.ts`: three cancellation and pause cases.
- `packages/server/src/registry-ownership.test.ts`: five inherited/explicit registration cases.
- `packages/server/src/collection-budgets.test.ts`: four cases exercising both validators.

The full repository build passed, including native compiler validation. The complete package suite
passed with 340 test files and 2,022 tests, with two files and five tests skipped. After the final
registry-composition refinement and two additional explicit-name tests, the focused server, task,
and DOM root-lifecycle run passed all 23 tests. Frozen 0.5.0 artifacts passed against the current
runtime without regeneration, covering tasks, updates, keyed identity, SSR, hydration, and disposal.
Platform-boundary bundling also passed.

Test-source and documentation-app typechecking passed, as did all ten documentation-app tests.
Source architecture and JSDoc checks passed. Changed-file lint reported no errors (three ignored
fixture warnings), and the final diff whitespace check passed. Engineering references and public
state, task, and server documentation describe the corrected behavior.

The existing reactive benchmark completed all 12 scenarios and their correctness checks. It ran
alongside other validation, so its timings are not evidence of a performance improvement.

The subsequent [performance refresh](performance-baselines/post-audit-2026-09-07.md) reruns
measurements separately from correctness validation, updates the public charts, and measures
transactional Map/Set deletion costs directly.

The [September 8 efficiency follow-up](performance-baselines/collection-audit-efficiency-2026-09-08.md)
avoids rebuilding a collection when restoring a deleted last entry. It retains the original successor
capture and correctness guarantees, with additional regression coverage and paired microbenchmarks.

The subsequent [full efficiency review](performance-baselines/audit-efficiency-2026-09-08.md)
evaluates every audit area. Tasks retain cancellation through a disposable scope continuation instead
of an additional wait promise and abort listener. Short protocol strings avoid encoded-buffer allocation,
and registry composition avoids unnecessary intermediate Maps. Dispatch ownership, byte/node limits,
dependency identity, and ordering guarantees remain intact.

## Compatibility and remaining limits

These fixes restore existing transaction, ownership, allowlist, and validation promises. The optional
resume-wait signal is additive. No artifact format, ABI epoch, or required helper signature changed.
Frozen artifact compatibility is supporting evidence, not a substitute for semantic ABI review.

Preserving deletion order adds linear ordering-anchor work to transactional collection deletions;
ordinary deletions retain their existing constant-time path. Primitive-key dependency identities
remain owned by the collection for its lifetime. This audit does not establish bounded metadata
growth for collections receiving indefinitely many distinct primitive keys.

The review also inspected compiler placement/registry paths and DOM/hydration ownership boundaries
and exercised their existing regressions. This is a targeted adversarial audit, not exhaustive
compiler verification, a browser security certification, or a replacement for release/dependency
auditing. Continued fuzzing of compiler semantics and cross-boundary cancellation remains useful.
