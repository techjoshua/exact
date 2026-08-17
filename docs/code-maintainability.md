# Code maintainability standard

eXact is a new framework. Its source should optimize for explicit contracts,
cohesive modules, testability, and straightforward control flow rather than
preserving accidental internal structure.

## Module ownership

- A module should own one domain concept, state machine, or algorithm.
- Public `index.ts` files are API facades. Implementation belongs in named
  domain modules.
- Internal modules import their dependencies directly; they do not import back
  through their package's public façade.
- Shared helpers live with the narrowest domain that owns their semantics.
- Generic `utils.ts` modules are not permitted. A helper without a clear owner
  is usually a missing domain concept.
- Similar code may remain duplicated when sharing it would couple independent
  packages or erase meaningful differences in behavior.

## Helper extraction

Extract a helper when it names a domain operation, isolates a side effect,
centralizes an invariant, removes proven duplication, or makes behavior
independently testable. Do not extract a helper merely to reduce a line count.

For complex operations, prefer the following shape:

1. validate input;
2. prepare or plan without externally visible mutation;
3. apply mutations;
4. transfer ownership or publish state;
5. clean up superseded resources.

Keep pure planning separate from mutation where practical. Small result objects
are preferable to long parameter lists or several parallel mutable collections.

## JSDoc

JSDoc is required for exported functions, classes, interfaces, types, constants,
and public class methods. Internal declarations also require JSDoc when they
define lifecycle behavior, ownership, security rules, non-obvious invariants, or
important algorithms.

Documentation should describe the contract rather than repeat the TypeScript
signature. Include relevant details about:

- mutation and other side effects;
- ownership, cleanup, and disposal;
- cancellation and asynchronous settlement;
- defaults, units, and input constraints;
- expected errors;
- security or trust-boundary assumptions;
- algorithmic complexity where it affects callers.

## Type erasure

Prefer generics when a public adapter can preserve the source contract, and use `unknown` plus
validation for data crossing a trust boundary. Explicit `any` remains legitimate for narrow
existential component and compatibility internals where callers must accept every state or props
shape. The repository ratchet prevents the production total from increasing; remove or lower its
baseline as erasure is replaced, and do not hide new `any` behind casts or broad lint exclusions.

Use `@param`, `@returns`, `@throws`, `@example`, and `@deprecated` only when they
add information beyond the signature.

## Guiding comments

Comments inside functions explain why ordering or an implementation choice
matters. Use them at state transitions, validation/mutation boundaries,
fixed-point analysis phases, ownership transfers, and compatibility exceptions.

Do not narrate obvious statements. Comments that no longer describe the code
are defects and must be updated or removed with the corresponding change.

## Tests

- Tests are grouped by behavior, not by the public entry file that exposes it.
- Reusable fixtures belong in `test-support` and are excluded from production
  output.
- Temporary resources register cleanup immediately after creation.
- Pure planning and validation helpers receive direct tests when their behavior
  is important or has meaningful edge cases.
- Regression comments explain the invariant that was previously violated, not
  the mechanics of the assertion.

## Change acceptance

Each architectural change must:

- preserve or deliberately improve observable behavior;
- leave public API changes explicit;
- add or update focused tests;
- document affected contracts and non-obvious control flow;
- avoid new dependency cycles and platform-boundary violations;
- pass type checking, package tests, package-content checks, and relevant
  performance guards.
