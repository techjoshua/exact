# Core API ownership

The `@exactjs/core` root remains the concise authored component surface. Its exports are classified
in `packages/core/api-ownership.json` as application, runtime-adapter, or compiler-framework owned.
The release gate rejects unclassified additions.

Application code should use component state, contexts, tasks, registries, JSX values, and authored
VNode helpers from the root. Renderer and build-adapter code should prefer the matching
`@exactjs/core/runtime/*` or `@exactjs/core/framework/*` subpath. Remaining compiler-framework root
exports are compatibility aliases during the 0.x deprecation window; they must not be treated as
stable application contracts.

Render-program symbols and construction, compiled VNode/cell helpers, component instance
construction/rendering, and compiled registry construction have completed that migration and are
available only from `@exactjs/core/runtime/render` or `@exactjs/core/runtime/registry`. Executable
component identities and contracts are available only from
`@exactjs/core/framework/component-contracts`. The ownership release gate checks both module
classification and this symbol-level exclusion so an internal helper cannot drift back into the
root through a mixed application module.

The client/server operation wire types are framework-owned contracts under
`@exactjs/core/framework/operation-protocol`. Hydration depends on that neutral contract rather
than the server implementation package. `@exactjs/server` re-exports the same types for source
compatibility, but new framework integrations should import the Core subpath directly.
