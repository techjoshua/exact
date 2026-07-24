# Vite adapter discovery fixture

Private package fixture used by `@exactjs/vite-plugin` and React compatibility tests. Its
dependencies provide a controlled package graph for adapter discovery, version selection,
diagnostics, and cache invalidation.

Do not install or publish this package. Version and dependency changes must be reflected in the
tests that assert discovery results.
