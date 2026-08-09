# Repository documentation

The `docs` directory contains engineering documentation for the current eXact
repository. It is organized by authority so that an old implementation plan
cannot be mistaken for a current framework contract.

## Current references

These documents describe behavior that exists in the repository today:

| Document                                                                         | Subject                                                                                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [actions-and-forms.md](actions-and-forms.md)                                     | Task interactions, optimism, forms, and router coordination.                                                           |
| [code-maintainability.md](code-maintainability.md)                               | Required source, ownership, JSDoc, and testing standards.                                                              |
| [component-language.md](component-language.md)                                   | Complete native component and TSX authoring reference.                                                                 |
| [component-library-trust.md](component-library-trust.md)                         | Bundler-enforced server component package authorization.                                                               |
| [component-registries.md](component-registries.md)                               | Finite eager/lazy component selection, identity, SSR, and hydration.                                                   |
| [distributed-component-continuations.md](distributed-component-continuations.md) | Compiler-distributed client/server component state machines.                                                           |
| [devtools.md](devtools.md)                                                       | Authorized browser/server inspection, federation, redaction, and agents.                                               |
| [framework-plugins.md](framework-plugins.md)                                     | Plugin discovery, configuration, projections, and lifecycle.                                                           |
| [gestures.md](gestures.md)                                                       | Prepared gesture recognition, ownership, accessibility, and testing.                                                   |
| [gravity.md](gravity.md)                                                         | Pure acceleration fields and physics force registration.                                                               |
| [instrumentation.md](instrumentation.md)                                         | Optional profiling contracts and event collection.                                                                     |
| [internationalization.md](internationalization.md)                               | Experimental native intl analysis, source-message extraction, XLIFF catalogs, runtime, and shared bundler integration. |
| [jsx-cells.md](jsx-cells.md)                                                     | Internal reactive JSX cell and mounted-range model.                                                                    |
| [language-tools.md](language-tools.md)                                           | Compiler inspection, LSP, VS Code, diagnostics, and safe task refactors.                                               |
| [microfrontends.md](microfrontends.md)                                           | Implemented trusted microfrontend scope and remaining adapter work.                                                    |
| [motion.md](motion.md)                                                           | Prepared motion definitions, finite playback, configuration, and current limits.                                       |
| [native-compiler.md](native-compiler.md)                                         | Native compiler architecture, distribution, sessions, and release checks.                                              |
| [native-ssr-production-guide.md](native-ssr-production-guide.md)                 | Production SSR, request, response, security, and deployment contracts.                                                 |
| [performance.md](performance.md)                                                 | Opt-in JavaScript performance suite, measurement contract, and tracked baseline.                                       |
| [physics.md](physics.md)                                                         | Deterministic simulation, component ownership, and safe DOM projection.                                                |
| [react-compatibility.md](react-compatibility.md)                                 | React 18/19 compatibility surface and explicit fidelity limits.                                                        |
| [react-ecosystem-adapters.md](react-ecosystem-adapters.md)                       | Native substitutions for selected React-owned packages.                                                                |
| [react-router-compatibility.md](react-router-compatibility.md)                   | Implemented React Router 5/6/7 facade coverage.                                                                        |
| [sample-applications.md](sample-applications.md)                                 | Complete native applications and their build or runtime focus.                                                         |
| [scheduling-suspense-activity.md](scheduling-suspense-activity.md)               | Native scheduling, readiness, retained DOM, and async-component semantics.                                             |
| [server-components.md](server-components.md)                                     | Authoring and operating server-executed component work.                                                                |
| [server-context-and-data-policy.md](server-context-and-data-policy.md)           | Context lifetime, placement, residency, sharing, and secret boundaries.                                                |
| [ssr-hydration.md](ssr-hydration.md)                                             | Current SSR, streaming, hydration, and patch capabilities.                                                             |
| [tasks.md](tasks.md)                                                             | Function-defined tasks, structured lifetime, policy, status, and task ABI.                                             |

The public learning guide is the eXact docs application under
[`apps/docs`](../apps/docs). Package-level API entry points live in the
`README.md` belonging to each package.

## Proposals

[`proposals`](proposals) contains active designs and exploratory work. Neither
is current framework behavior or a release commitment. Code and the current
references above remain authoritative.

The proposal program is executed through the following gates. A later stage may be investigated,
but it is not finalized or advertised until every earlier completion gate is satisfied. When a
performance experiment succeeds, either implement it under an already decision-complete proposal
or create and insert a focused proposal before any dependent stage; when it fails, record the
rejection and continue. “Resolve” therefore means an explicit accept-or-reject decision, not an
indefinite exploratory pause.

| Stage | Work                                                                                                | Completion gate                                                                                                                                                                                                          |
| ----: | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|     0 | [Recursive server/client graph partitioning](history/recursive-server-client-graph-partitioning.md) | **Completed and archived:** retain as the protocol and ownership baseline.                                                                                                                                               |
|     1 | [JavaScript performance measurement baseline](history/javascript-performance-improvements.md)       | **Completed and archived:** compiled DOM gate plus production-shaped client, server, network, heap, Chromium, and build baselines.                                                                                       |
|     2 | [Separate enhancements from framework plugins](history/enhancements-as-component-composition.md)    | **Completed and archived:** enhancement terminology, activator grouping, `_`, `_target`, bounded routing, ownership, and metadata.                                                                                       |
|     3 | [Bundler-enforced server component-library trust](history/server-component-library-trust.md)        | **Completed and archived:** authorize resolved server-executing component graphs without adding compiler policy.                                                                                                         |
|     4 | [Component value/callback binding shorthand](history/component-value-callback-bindings.md)          | **Completed and archived:** finite component pairs, canonical intrinsic endpoints, details adoption, and language tooling.                                                                                               |
|     5 | [Cooperative structured children](proposals/cooperative-structured-children.md)                     | **Removed from the sequence:** independent exploratory work; lexical intl message ownership no longer depends on it.                                                                                                     |
|     6 | [Enhancement-first internationalization](proposals/enhancement-first-internationalization.md)       | **Implemented experimentally:** protocol 1, native analysis, runtime, package catalogs, interchange, units, capability providers, lazy generations, and shared Vite/Bun/Webpack coordination pass the architecture gate. |
|     7 | [Dependent performance foundations](history/javascript-performance-improvements.md)                 | **Completed and archived:** accepted experiments 2–4, implemented experiment 6, rejected unmeasured binary/worker expansion, and recorded evidence.                                                                      |
|     8 | [Compiler-owned render programs](history/compiler-owned-render-programs.md)                         | **Completed and archived:** finite intrinsic programs share host semantics across markerless SSR, DOM mount/patch, and hydration.                                                                                        |
|     9 | [Bounded deterministic async SSR](history/bounded-deterministic-async-ssr.md)                       | **Completed and archived:** proven sibling groups use one nested-safe request scheduler and deterministic authored-order publication.                                                                                    |
|    10 | [Compact hydration and progressive publication](history/compact-hydration-publication.md)           | **Completed and archived:** grouped rows, dormant ownership, corruption isolation, and progressive helper handoff are implemented.                                                                                       |
|    11 | [Compiler-planned server execution graphs](proposals/compiler-planned-server-execution-graphs.md)   | Start proven render-required server work when reachability, ownership, and inputs are ready instead of waiting for recursive discovery.                                                                                  |
|    12 | [Broader lazy interaction-island eligibility](proposals/lazy-interaction-islands.md)                | Implement deferred ownership, replay, capability splitting, hydration, and diagnostics over the settled contracts.                                                                                                       |
|    13 | [Compiler-planned structural refresh](proposals/compiler-planned-structural-refresh.md)             | Implement typed structural plans using the settled render-slot, activation, and fallback contracts.                                                                                                                      |
|    14 | [Serializable partial-prerender resumption](proposals/partial-prerender-resumption.md)              | Implement authenticated reconstruction using settled execution, structural, SSR ownership, and streaming contracts.                                                                                                      |
|    15 | [Webpack and Bun microfrontend production parity](proposals/webpack-bun-microfrontend-parity.md)    | Complete heterogeneous adapter conformance over all preceding artifact, trust, locale, activation, refresh, and resumption contracts.                                                                                    |
|    16 | [Remaining JavaScript performance experiments](history/javascript-performance-improvements.md)      | **Completed and archived:** accepted bounded tooling/diagnostics, recorded measured rejections, and stopped after final profiles found no unnamed target.                                                                |

The active and gated documents are:

| Proposal                                                                                                       | Status       | Scope                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------- |
| [Cooperative structured children](proposals/cooperative-structured-children.md)                                | Exploratory  | Independent compound-component coordination research; it no longer blocks internationalization.                 |
| [Enhancement-first internationalization](proposals/enhancement-first-internationalization.md)                  | Experimental | Protocol-1 lexical messages and shared native analyzer/runtime/bundler architecture pass their acceptance gate. |
| [Compiler-planned server execution graphs](proposals/compiler-planned-server-execution-graphs.md)              | Proposed     | Start eligible render-data tasks from compiler-proven request reachability and dependency readiness.            |
| [Broader lazy interaction-island eligibility](proposals/lazy-interaction-islands.md)                           | Gated        | Defer more statically safe client regions after the accepted performance foundations are implemented.           |
| [Compiler-planned structural refresh](proposals/compiler-planned-structural-refresh.md)                        | Proposed     | Emit source-informed refresh plans while retaining validated boundary replacement.                              |
| [Serializable partial-prerender resumption](proposals/partial-prerender-resumption.md)                         | Proposed     | Persist authenticated postponed renderer/task state and resume it in a later request.                           |
| [Webpack and Bun microfrontend production parity](proposals/webpack-bun-microfrontend-parity.md)               | Proposed     | Complete adapter lifecycle and heterogeneous conformance over the shared artifact model.                        |
| [Accessibility enhancements and compiler diagnostics](proposals/accessibility-enhancements-and-diagnostics.md) | Proposed     | Add required accessibility enhancements, bounded compiler/LSP checks, and coordinated localized ARIA behavior.  |
| [Motion values and orchestration](proposals/exploratory-motion-values-and-orchestration.md)                    | Exploratory  | Investigate finite spring helpers, reactive motion values, gesture handoff, timelines, and shared elements.     |
| [Trusted language-service contributions](proposals/trusted-language-service-contributions.md)                  | Proposed     | Let trusted plugins and enhancements contribute bounded LSP and CLI assistance without compiler callbacks.      |

Other exploratory work that is not part of the sequential program until promoted into a focused
proposal:

| Document                                          | Scope                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| [Candidate future work](proposals/future-work.md) | Uncommitted framework, integration, sample, and optimization candidates. |

Delivered proposals move to [`history`](history) after their current contracts and remaining
limitations are captured by the references above. The archive preserves their delivery rationale
without presenting completed plans as active work.

## Historical evidence

[`history`](history) contains completed proposal records plus dated benchmark and adversarial-review
records. They explain why decisions were made but are not current API documentation. Every
historical record identifies its implemented contract, measurement baseline, or review baseline.

Completed proposal records:

| Proposal                                                                                            | Delivered contract                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Recursive server/client graph partitioning](history/recursive-server-client-graph-partitioning.md) | Maximal same-placement regions across alternating client and server descendants.                                                      |
| [Enhancements as component composition](history/enhancements-as-component-composition.md)           | Ordinary component-library enhancements, finite activators, direct `_`, semantic `_target`, bounded routing, and portable metadata.   |
| [Bundler-enforced server component-library trust](history/server-component-library-trust.md)        | Resolver-proven server component authorization, inert package facts, atomic development generations, and paired fingerprints.         |
| [Component value/callback binding shorthand](history/component-value-callback-bindings.md)          | Finite controlled-component pairs, canonical intrinsic endpoints, details hydration adoption, and binding-aware language tooling.     |
| [Compiler-owned render programs](history/compiler-owned-render-programs.md)                         | Branded finite host programs with shared SSR, DOM, hydration, property, namespace, event, ref, ownership, and fallback semantics.     |
| [Bounded deterministic async SSR](history/bounded-deterministic-async-ssr.md)                       | Compiler-proven sibling concurrency with one nested-safe request scheduler, ordered merging, cancellation, and serial fallback.       |
| [Compact hydration and progressive publication](history/compact-hydration-publication.md)           | Grouped finite rows, deferred activation ownership, row-local recovery, and deterministic progressive-helper handoff.                 |
| [JavaScript performance improvements](history/javascript-performance-improvements.md)               | Measured client/server baselines, accepted tooling and diagnostic bounds, and recorded rejections for unqualified runtime candidates. |

The current repository-wide implementation review is recorded in
[`history/repository-code-review-2026-07.md`](history/repository-code-review-2026-07.md).

## Maintenance rule

When implementation lands, update the relevant current reference and either move the completed
proposal to `history` or reduce it to unresolved follow-up work. Do not leave a completed plan in
`proposals` beside the implementation as though both were normative. Historical proposal records
must identify their delivered status and defer to current references for normative behavior.
