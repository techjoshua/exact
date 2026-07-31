# Using @exactjs/bun-plugin

Read this package's `README.md`, exported declarations, and the compiler package guidance before
editing Bun build configuration. Let the plugin own source transforms, compiler-session
invalidation, export conditions, and end-of-build inspection catalog emission.

Derive `emitInspection` and `instrumentInspection` independently from `debug`. Keep rich catalogs
under the server build's `outdir`; client output may contain only compact source IDs, value-free
redaction selectors, and the guarded page runtime bootstrap. Use the same immutable build/root
identity for paired production builds and set both controls to `false` for hardened builds.

Do not infer task or action source identity from runtime array order. Preserve the callback marker
emitted by the native compiler.
