# Framework comparison suite

The repository's [`framework-comparison`](../framework-comparison) directory defines a reproducible,
production-shaped application comparison for eXact and other web frameworks. Its application contract,
deterministic fixture and service, scenario catalog, fairness methodology, production SSR applications,
black-box acceptance suites, and measurement harness are implemented. The controlled track includes eXact,
React, SvelteKit, and Nuxt. The native track includes eXact compiler server tasks and React Router loaders and
actions. All participants remain scaffolded until specialist review; publishable results have not been added.

The eXact browser build explicitly selects the hydrating component-contract projection: it preserves the
same SSR adoption behavior while leaving analysis-only component inventories out of the shipped bundle.

## What the suite compares

The application is an incident-operations console with server-renderable queues, deep-linked details,
optimistic claims, stale-version conflicts, validated comments, asynchronous server analysis, and live updates.
Every participant must produce equivalent visible and accessible outcomes while retaining framework-native
component, routing, state, cache, rendering, and server-invocation choices.

Two tracks prevent architectural and rendering questions from being conflated:

- **Controlled service** participants use the same Fetch-compatible JSON and server-sent event service. This
  track emphasizes browser delivery, startup, rendering, updates, and interaction behavior.
- **Native full stack** participants use the framework's preferred server actions, loaders, RPC, streaming, and
  cache model while preserving the same domain and user-experience contract.

Results from different tracks are never placed in the same ranking.

## Current commands

```sh
npm run check:framework-comparison
npm run test:framework-comparison
npm run start:framework-comparison-service
npm run build -w @exactjs/framework-comparison-suite
npm run test:e2e -w @exactjs/framework-comparison-suite
npm run test:native -w @exactjs/framework-comparison-suite
npm run measure:development -w @exactjs/framework-comparison-suite
npm run measure:native:development -w @exactjs/framework-comparison-suite
```

The service defaults to `http://127.0.0.1:4310`. The suite check validates fixture identity and ownership,
scenario references, declared metrics, and participant metadata. Focused tests protect optimistic concurrency,
mutation versioning, input validation, asynchronous job progression, and benchmark-only reset authorization.
The controlled browser suite runs 28 checks across four participants, covering SSR/hydration, filters,
optimistic claims and conflicts, comments, analysis progress, live updates, focus preservation, empty data,
recoverable failures, keyboard use, and event reconnect. A separate eight-check native suite protects SSR,
framework-owned mutations, asynchronous analysis, and cross-session focus preservation without mixing
track results.

## Measurement policy

Correctness gates every timed scenario. Runs retain raw samples, environment and dependency metadata, exact
participant revisions, and limitations. Performance remains a vector of browser, server, build, delivery, and
memory measurements; codebase complexity remains a separate profile of authored code, dependencies, boundary
plumbing, error paths, review findings, and standardized change effort. The suite does not calculate a synthetic
overall winner. Development measurement commands may collect explicitly non-publishable samples for either
track while reviews are pending; both publication commands reject unreviewed participants.

Controlled browser results are labeled warm and follow one discarded, equivalent scenario per participant.
Interaction latency is measured from the browser's captured click to the corresponding visible DOM mutation;
automation actionability waits and assertion polling are therefore excluded, while interaction-triggered
hydration remains included.

Heap samples are taken after semantic readiness, one rendering opportunity, and explicit garbage collection.
They are labeled as post-GC retained heap so ordinary allocation and collection timing is not mistaken for
cross-sample growth. Dedicated repeated-lifecycle profiling is still required to diagnose an actual leak.

The normative fairness and reporting rules live in
[`framework-comparison/methodology.md`](../framework-comparison/methodology.md). The detailed experience and
domain invariants live in
[`framework-comparison/specification/application.md`](../framework-comparison/specification/application.md).
