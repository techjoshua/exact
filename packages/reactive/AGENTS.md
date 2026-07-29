# Using @exactjs/reactive

Read this package's `README.md` and exported declarations before using low-level primitives.
Application components should normally use direct `this.state` reads and writes; reach for this
package when building an explicit reactive model or framework integration.

Use native-looking array, `Map`, and `Set` reads and mutations on reactive proxies. Prefer
`computed()` for a reusable pure value, `watch()` for a low-level observed effect, and `batch()`
only when an external integration must define a transaction explicitly. Component code should
prefer compiler-owned batching and component tasks.

Optimistic action rollback is implemented with internal mutation journals. Preserve path,
array-sequence, Map-entry, and Set-membership granularity so rollback does not overwrite later
authoritative writes. Applications should not call journal internals or maintain a parallel
optimistic store.
