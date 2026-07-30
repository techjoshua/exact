# Repository documentation

The `docs` directory contains engineering documentation for the current eXact
repository. It is organized by authority so that an old implementation plan
cannot be mistaken for a current framework contract.

## Current references

These documents describe behavior that exists in the repository today:

| Document                                                                         | Subject                                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [actions-and-forms.md](actions-and-forms.md)                                     | Task interactions, optimism, forms, and router coordination.               |
| [code-maintainability.md](code-maintainability.md)                               | Required source, ownership, JSDoc, and testing standards.                  |
| [component-language.md](component-language.md)                                   | Complete native component and TSX authoring reference.                     |
| [component-registries.md](component-registries.md)                               | Finite eager/lazy component selection, identity, SSR, and hydration.       |
| [distributed-component-continuations.md](distributed-component-continuations.md) | Compiler-distributed client/server component state machines.               |
| [devtools.md](devtools.md)                                                       | Authorized browser/server inspection, federation, redaction, and agents.   |
| [framework-plugins.md](framework-plugins.md)                                     | Plugin discovery, configuration, projections, and lifecycle.               |
| [instrumentation.md](instrumentation.md)                                         | Optional profiling contracts and event collection.                         |
| [jsx-cells.md](jsx-cells.md)                                                     | Internal reactive JSX cell and mounted-range model.                        |
| [language-tools.md](language-tools.md)                                           | Compiler inspection, LSP, VS Code, diagnostics, and safe task refactors.   |
| [manifest-usage-inventory.md](manifest-usage-inventory.md)                       | Remaining compiler-manifest producers and consumers.                       |
| [microfrontends.md](microfrontends.md)                                           | Implemented trusted microfrontend scope and remaining adapter work.        |
| [native-compiler.md](native-compiler.md)                                         | Native compiler architecture, distribution, sessions, and release checks.  |
| [native-ssr-production-guide.md](native-ssr-production-guide.md)                 | Production SSR, request, response, security, and deployment contracts.     |
| [react-compatibility.md](react-compatibility.md)                                 | React 18/19 compatibility surface and explicit fidelity limits.            |
| [react-ecosystem-adapters.md](react-ecosystem-adapters.md)                       | Native substitutions for selected React-owned packages.                    |
| [react-router-compatibility.md](react-router-compatibility.md)                   | Implemented React Router 5/6/7 facade coverage.                            |
| [scheduling-suspense-activity.md](scheduling-suspense-activity.md)               | Native scheduling, readiness, retained DOM, and async-component semantics. |
| [server-components.md](server-components.md)                                     | Authoring and operating server-executed component work.                    |
| [server-context-and-data-policy.md](server-context-and-data-policy.md)           | Context lifetime, placement, residency, sharing, and secret boundaries.    |
| [ssr-hydration.md](ssr-hydration.md)                                             | Current SSR, streaming, hydration, and patch capabilities.                 |
| [tasks.md](tasks.md)                                                             | Function-defined tasks, structured lifetime, policy, status, and task ABI. |

The public learning guide is the eXact docs application under
[`apps/docs`](../apps/docs). Package-level API entry points live in the
`README.md` belonging to each package.

## Proposals

[`proposals`](proposals) contains both active designs and retained rationale
for delivered designs. Every proposal begins with an implementation-status
ledger that distinguishes current behavior from deferred work. Code and the
current references above remain authoritative.

Active proposals:

| Proposal                                                                                                | Scope                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Unified function-defined tasks and structured task trees](proposals/unified-function-defined-tasks.md) | Replaces separate authored task/action APIs with compiler-recognized functions, one structured lifetime, unified tooling, and a future motion foundation. |
| [Optional motion component library](proposals/motion-component-library.md)                              | Defines task-owned presence, element, list, layout, reduced-motion, and dependency-neutral router transition coordination.                                |

## Historical evidence

[`history`](history) contains dated benchmark and adversarial-review records.
They explain why decisions were made but are not current API documentation.
Every historical record identifies its measurement or review baseline.

The current repository-wide implementation review is recorded in
[`history/repository-code-review-2026-07.md`](history/repository-code-review-2026-07.md).

## Maintenance rule

When implementation lands, update the relevant current reference and either
remove its completed plan or reduce the plan to unresolved follow-up work.
Do not leave a completed `*-plan.md` beside the implementation as though both
were normative. Git history is the archive for discarded delivery detail.
