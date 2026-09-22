# September 2026 correctness findings

This retrospective consolidates durable lessons from completed audits through September 22, 2026.
It preserves decisions, not an assertion that today's checkout passes historical checks. Corrections
belong in a later linked finding. Current behavior belongs in the framework references and tests.

## Repair the failing contract rather than narrowing the fixture

A prop-derived state initializer ran as scheduled client work after hydration restored state,
overwriting the restored value. Narrowing the fixture to a constant initializer hid the defect.
The correction restored the original regression and ordered synchronous setup, captured-state
restoration, and dependency subscription correctly. A related parent-owned reactive-prop regression
required observing and rebinding the retained source, not just the child slot.

Shipping's absent hydration markers were also a real framework failure, not merely a stale test.
The fixes belonged in SSR island publication and hydration ownership. Compiler incremental JSX reuse
and dependency advisories were addressed independently. A passing subset or changed fixture was
not evidence that the omitted failure had been resolved.

## Preserve explicit security and ownership boundaries

Audits exercised native property validation, reactive rollback, server dispatch and authorization,
decoded hydration data, secret projection, cookie preservation, cancellation, and cleanup.
Regression tests and maintained contracts now own those behaviors. Optimizations must preserve
their allowlists, byte/node limits, request isolation, ordering, and disposal semantics.

The framework does not sandbox arbitrary in-process server JavaScript or direct platform APIs.
Secret access is capability-by-possession; hosts must pass scoped resolvers, not factories.
Schema checks and representative ABI fixtures support semantic compatibility review but cannot
prove all possible artifact behavior. Publication preflight is not transactional, and output-path
validation does not defend against concurrent hostile filesystem mutation.

The earlier router review bounded compatibility to the documented library/data-router surfaces;
framework mode, unsupported versions, and unimplemented exports were not promises to emulate them.
The July tooling review left a common host-snapshot abstraction unselected because existing hosts
owned stable engines and no demonstrated defect justified another abstraction.

## Historical sources

The [September 12 audit](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/adversarial-framework-audit-2026-09-12.md)
and [September 13 follow-up](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/remaining-audit-investigation-2026-09-13.md)
retain reproductions, scope, and the original validation record. Earlier
[runtime](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/adversarial-framework-audit-2026-09-07.md),
[release](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/adversarial-release-audit-2026-09-07.md),
and [repository](https://github.com/techjoshua/exact/blob/e357267aebd4659e186efa30516fde8ed4890c18/docs/history/repository-code-review-2026-07.md)
reviews remain accessible in Git. Their original dependency advisories and test totals are dated
observations, not current release status.
