# Core API ownership

The `@exactjs/core` root remains the concise authored component surface. Its exports are classified
in `packages/core/api-ownership.json` as application, runtime-adapter, or compiler-framework owned.
The release gate rejects unclassified additions.

Application code should use component state, contexts, tasks, registries, JSX values, and authored
VNode helpers from the root. Renderer and build-adapter code should prefer the matching
`@exactjs/core/runtime/*` or `@exactjs/core/framework/*` subpath. Compiler-framework root exports
are compatibility aliases during the 0.x deprecation window; they must not be treated as stable
application contracts. They will be removed from the root at the next breaking release after all
generated imports and maintained adapters use ownership-specific subpaths.

Render-program construction, inspection, fallback, cache diagnostics, and contracts have completed
that migration and are available only from `@exactjs/core/runtime/render`.
