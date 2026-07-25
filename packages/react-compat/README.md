# @exactjs/react-compat

React API compatibility runtime and build support for running selected React packages and
components through eXact.

The package exposes React-compatible element creation, components, contexts, hooks, lazy and
Suspense behavior, children utilities, transitions, and adapter-aware package substitution. Use
the dedicated `./build`, `./plugin`, `./transform`, and `./exact` entrypoints only from tooling or
integration code.

This is a compatibility layer, not the native eXact component model. New eXact components should
use `this.state`, lifecycle methods, tasks, and compiled JSX rather than React hooks.

React `Suspense` uses eXact readiness ranges for lazy and `use()` thenables. React 19 `Activity`
maps visible/hidden behavior onto retained native ranges and reconnects effects and external-store
subscriptions when shown again. Transition and deferred-value updates enter eXact's deferred
scheduler lane.
