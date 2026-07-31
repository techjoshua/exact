# Maintaining Parcel Lab

Read this app's `README.md`, `docs/tasks.md`, and the installed `@exactjs/core` guidance before
changing component work.

Keep the browser-owned workspace as one inspectable component instance. Mutate `this.state`
directly and keep the tracked revision as the activation input for rate refreshes; capture the
draft and configured providers through defaulted non-context parameters.

Define route and provider refreshes as attached child tasks. Await each server operation inside
its child so results can publish progressively under compiler generation fencing. Do not restore
manual revision comparisons, post-await abort checks, authored operation IDs, or direct
`ExactClient` calls. Provider credentials, registry modules, and quote execution remain
server-only.

Run `npm run test:shipping` and `npm run build:shipping` after component or task changes.
