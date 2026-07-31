# Using @exactjs/webpack-plugin

Read this package's `README.md`, exported declarations, and the compiler package guidance before
editing Webpack configuration. Let the plugin own its pre-loader, compiler session, watch
invalidation, export conditions, and inspection asset lifecycle.

Derive `emitInspection` and `instrumentInspection` independently from `debug`. Keep rich catalogs
in server `processAssets`; client output may contain only compact source IDs, value-free redaction
selectors, and the guarded page runtime bootstrap. Use the same immutable build/root identity for
paired production builds and set both controls to `false` for hardened builds.

Do not reproduce source-entity ordering in a loader or UI. The native compiler marks each task and
action callback with its canonical ID, and runtime consumers must preserve that identity.
