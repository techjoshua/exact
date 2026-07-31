# Maintaining Parcel Lab

Read this app's `README.md`, `docs/tasks.md`, and the installed `@exactjs/core` guidance before
changing component work.

Keep the browser-owned workspace as one inspectable component instance. Mutate `this.state`
directly and keep the tracked revision as the activation input for rate refreshes; capture the
draft and configured providers through defaulted non-context parameters. Let reactive activation
infer latest-wins scheduling, browser APIs infer ordinary client work, default child invocation
infer parallel scheduling, and the debounce helper's optional final `AbortSignal` receive the
compiler-supplied generation signal.

Keep `peek()` around the one-time copies from the server-provided `initial` model into
browser-owned workspace state. Those are intentional ownership snapshots; direct reactive prop
reads change the generated client-island boundary.

Define route and provider refreshes as attached child tasks. Await each server operation inside
its child so results can publish progressively under compiler generation fencing. Keep explicit
`server()` placement on protected operations and explicit `client()` placement on the mixed-side
state-publishing coordinators; the compiler rejects those coordinators as indivisible without that
boundary. Do not restore redundant `parallel()`/`latest()` policy, manual signal arguments,
revision comparisons, post-await abort checks, authored operation IDs, or direct `ExactClient`
calls. Provider credentials, registry modules, and quote execution remain server-only.

Keep every generated executor-bearing root used by the app in the server's
`composeExactExecutorContract()` input. For the current app that includes both
`ShippingCalculatorPage` and `CalculatorWorkspace`; never replace that allowlist
with authored operation IDs or a permissive dispatch table.

Run `npm run test:shipping` and `npm run build:shipping` after component or task changes.
