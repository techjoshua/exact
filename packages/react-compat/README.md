# @exactjs/react-compat

React API compatibility runtime and build support for running selected React packages and
components through eXact.

The package exposes React-compatible element creation, components, contexts, hooks, lazy and
Suspense behavior, children utilities, transitions, and adapter-aware package substitution. Use
the dedicated `./build`, `./plugin`, `./transform`, and `./exact` entrypoints only from tooling or
integration code.

This is a compatibility layer, not the native eXact component model. New eXact components should
use `this.state`, lifecycle methods, tasks, and compiled JSX rather than React hooks.
