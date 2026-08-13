# Structural render-program refresh extensions

## Status

Deferred and removed as a standalone delivery gate after reevaluating the implemented compiler,
SSR, hydration, and component-execution architecture. The original proposal assumed the framework
still needed a new structural ownership plan. It does not.

The current framework already has:

- compiler-owned partition nodes with placement, range containment, refresh authority, and
  generation fencing;
- compiler-owned render programs with stable node and scalar-slot identities;
- cached root execution blueprints and attached per-component execution contracts;
- text, property, style, keyed-list, stable dynamic-range, nested-element, and authoritative
  boundary patches; and
- independent server and client validation before a patch is published.

The remaining opportunity is an optimization: some structural refreshes still serialize complete
HTML and let the safe differ rediscover branch or sibling shape. A measured extension may let an
existing render program emit a typed structural result directly.

| Area                | Implemented contract                                       | Possible measured extension                  |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Ownership           | Partition range, owner, build, and generation              | Reuse unchanged                              |
| Static/scalar shape | Branded render program and typed scalar slots              | Add a bounded structural operation           |
| Refresh fallback    | Safe HTML differ and nearest authorized replacement        | Skip parsing when a typed operation succeeds |
| Client authority    | Patch kind, target, containment, and generation validation | Reuse unchanged                              |

## Decision

Do not introduce a second `StructuralRefreshPlan` beside render programs and partition plans.
Instead, add structural operations to the existing compiler-owned render-program contract one form
at a time, only after a production-shaped benchmark demonstrates that the operation reduces refresh
CPU, allocation, response size, or DOM disruption enough to justify its compiler and protocol
cost.

A future internal extension may be equivalent to:

```ts
type ExactStructuralRenderOperation =
	| { readonly kind: 'branch'; readonly range: number; readonly cases: readonly number[] }
	| { readonly kind: 'fragment'; readonly range: number }
	| { readonly kind: 'keyed'; readonly range: number; readonly keySlot: number };
```

These names are illustrative. Operations reuse the render program's build-scoped IDs and the
partition contract's containment. They are not application syntax, public patch authority, or a
serializable copy of the component tree.

## Goals

- Avoid parsing previous and next HTML when compiler-emitted typed results are sufficient.
- Preserve unaffected sibling DOM, focus, form state, refs, component instances, and resources.
- Reuse render-program slots, partition containment, patch validation, and lifecycle release.
- Keep every extension region-local and retain the generic differ and authoritative replacement.
- Prove a net improvement in complete refresh workloads, including metadata bytes and retained
  heap.

## Non-goals

- Planning the whole component tree a second time.
- Replacing the component execution subgraph, root blueprint cache, or request scheduler.
- Supporting persisted cross-request renderer reconstruction; that work is intentionally not
  planned.
- Sending compiler IR, source text, closures, component instances, or bundler paths to clients.
- Removing the HTML differ or boundary replacement correctness paths.
- Adding a broad public structural-patch API before a concrete operation needs one.

## Ownership and execution

The native compiler remains the only source of structural proof. A structural operation belongs to
one existing render-program region and refers to targets already contained by its partition edge.
The operation cannot expand refresh authority, cross an enhancement component owner, search through
an opaque component frame, or reuse authority from an earlier generation.

On refresh, the server evaluates only the operation's typed slots. If the current program,
partition, previous snapshot, branch/key identity, resource budget, or target generation does not
match, execution falls back at that same range. The fallback may use the existing safe differ and
then the nearest authoritative replacement; malformed metadata never broadens permission.

The client continues to validate the existing build, execution-root, boundary generation, patch
kind, target kind, containment, ordering, and resource budgets. Structural removal uses ordinary
DOM/component lifecycle release. No parallel mounted tree or client structural planner is added.

Active enhancement components and translated structural messages follow their existing component,
catalog, root-frame, and partition ownership. A structural fast path may operate inside an
authorized range but cannot bypass those owners or treat rendered strings as durable identities.

## Candidate order

Candidates are investigated independently rather than accepted as one feature:

1. Conditional branch replacement where the compiler already owns one stable dynamic range.
2. Fragment or multiple-sibling replacement inside one stable range.
3. Keyed-list snapshots that can avoid duplicate HTML and parse-tree retention.
4. Registry selection when the existing registry marker and selected entry identity are available.
5. Nested server slots, Suspense, Activity, or enhancement-routed output only when their measured
   workload justifies additional metadata.

Failure of one candidate does not block later candidates or any sequential proposal.

## Performance gate

For each candidate, compare the proposed operation with the current safe differ and authoritative
replacement using production-shaped boundaries. Record:

- server CPU and allocations;
- peak and retained server heap;
- response and client-contract bytes, compressed and uncompressed;
- client validation allocation and mutation-to-paint time;
- preserved DOM identity where it affects focus, controls, or component ownership; and
- fallback frequency for real compiler output.

Accept an extension only when the complete path improves materially without an unacceptable bundle,
startup, hydration, or maintenance cost. Compiler metadata that merely moves rediscovery work into
every artifact is a regression.

## Verification

- Compiler semantic tests for the operation, target containment, and localized fallback.
- SSR differential tests comparing typed output, the safe differ, and complete rerendering.
- DOM tests for sibling identity, focus, form state, refs, handlers, and cleanup.
- Adversarial tests for wrong targets, kinds, builds, generations, keys, and excessive operations.
- Property tests for the bounded structural form being added, not for an invented universal plan.
- Benchmark and heap evidence attached to the implementation decision.

## Acceptance criteria for any extension

1. It reuses an existing render-program and partition owner rather than creating a parallel plan.
2. Server and client independently enforce the existing target and containment authority.
3. Unsupported or inconsistent input falls back at the nearest safe range.
4. Lifecycle cleanup is identical to ordinary renderer-owned replacement.
5. The operation contains no application closure, source text, secret value, or public bundler path.
6. Measured end-to-end benefit exceeds the metadata and implementation cost.
