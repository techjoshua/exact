# Maintaining the eXact documentation app

Treat the docs app as the public learning guide. Add every routable article to
`src/docs-manifest.ts` so navigation, search, SSR route collection, and the standalone build see
the same page inventory. Keep previous/next links consistent with manifest order.

When a framework proposal lands, update its status ledger, the authoritative engineering
reference under `docs`, affected package READMEs and AGENTS guides, and the corresponding public
article together. State deferred boundaries explicitly; do not present proposal-only behavior as
available.

For compiler-aware language tools, keep the public route, navigation/search
metadata, no-emit compiler contract, LSP/VS Code ownership split, trust
boundary, task-refactor limitations, and package map aligned with
`docs/language-tools.md`.

For full-stack DevTools, keep build controls, `allowDebug`, redaction, catalog identity,
microfrontend federation, Chromium/agent read-only behavior, and package ownership aligned with
`docs/devtools.md`. Present durable instances as the Components tree and aggregate only Profiler
lanes by authored component type; describe profiling as an explicit bounded capture of causal
frames finalized from retained history at Stop, never as an invented total order across federated
hosts.

Keep browser startup aligned with its input document: Vite development mounts into the empty app
root, while the standalone prerendered artifact hydrates its existing marked-up root. Do not use
hydration mismatch recovery as the ordinary client-only development path.

Present reactive and invoked work as activation modes of one function-defined task model. Keep
`TaskContext` policy, structured settlement, owner-bound status, cleanup/optimism, the versioned
library ABI, captured parameter defaults, and the framework frame SPI aligned with
`docs/tasks.md`. Distinguish tracked call arguments from generation-stable untracked defaults, and
do not restore separate authored task and action articles. Keep the tasks guide practical and
complete: cover creation and activation, dependency capture, effects versus results, concurrency
and priority scheduling, and how `async`, `await`, and task readiness interact with Suspense.
Establish the definition/activation/generation mental model with an inferred task before
introducing `TaskContext`; explain its default expression as erased compiler policy and its
parameter value as the real per-generation runtime capability. Explain that callable status
aggregates an owner's keyed lanes and use `taskStatus(task, { key })` for a stable lane-specific
view; do not imply that `.pending` selects the most recently invoked key.
Before teaching explicit cancellation or cleanup, explain automatic signal injection and
generation ownership for discoverable cancellable APIs and local disposable resources. State the
conservative boundary and use explicit `TaskContext` capabilities for opaque contracts.

Treat the Learn group as a curriculum. Open each article with the problem, ownership model, and
compiler/runtime responsibilities before introducing factories, policy chains, configuration, or
generated machinery. Prefer the first example that demonstrates inference or ordinary TypeScript;
introduce explicit framework controls only after explaining why they are needed.
Keep component instance-surface references limited to actual `this` members. Explain task
functions, `TaskContext` policy defaults, and other compiler-recognized language constructs in
their conceptual sections rather than presenting them as instance APIs.
Explain that setup-derived values are component-owned and share one cached result, while
view-local calculations belong to the reactive region that consumes them. Present inferred
single-consumer scalar or forwarded-identity cell elision as an emitted-code optimization, not as
a source-lifetime rewrite, and keep fresh identity allocations and `this.reactive()` as durable
boundaries.
Describe task origins as compiler-inferred work or tasks with authored `TaskContext` policy. Do
not imply that “explicit tasks” are a second task mechanism; reserve explicit/implicit wording for
the particular policy, dependency, ownership, or syntax choice it actually qualifies.
Establish the definition/activation/generation mental model with an inferred task before
introducing `TaskContext`; explain its default expression as erased compiler policy and its
parameter value as the real per-generation runtime capability.

In docs application components, keep compiler-known timers and listeners local to their task
generation so placement and cancellation are inferred. Author `TaskContext` only for policy or
opaque capabilities that behavior cannot reveal. Model concurrent state-publishing branches as
attached child task functions. Do not add manual signal plumbing, revision fences, or post-await
signal checks where compiler-lowered awaits and staged writes already reject stale work. Remember
that cleanup runs when its generation settles: do not register an opaque subscription in a
synchronous task and expect it to survive for the component lifetime. Prefer reactive activation
for effects driven by reactive framework state.
