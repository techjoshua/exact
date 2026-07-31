# Using @exactjs/reactive

Read this package's `README.md` and exported declarations before using low-level primitives.
Application components should normally use direct `this.state` reads and writes; reach for this
package when building an explicit reactive model or framework integration.

Use native-looking array, `Map`, and `Set` reads and mutations on reactive proxies. Prefer
`computed()` for a reusable pure value, `watch()` for a low-level observed effect, and `batch()`
only when an external integration must define a transaction explicitly. Component code should
prefer compiler-owned batching and function-defined tasks.

Preserve the transaction publication invariant: collect and deduplicate every affected subscriber
before invoking any scheduler. A custom scheduler may synchronously replace its watcher, and that
replacement must not observe another key from the transaction that caused it.

Optimistic task rollback is implemented with internal mutation journals. Preserve path,
array-sequence, Map-entry, and Set-membership granularity so rollback does not overwrite later
authoritative writes. Applications should not call journal internals or maintain a parallel
optimistic store.

`onMutation` is a framework diagnostic boundary. Invoke it after a successful mutation, isolate
its failures, and report only the mutated key and operation. Do not pass values, read reactive
state from the callback, create dependencies, or change batching and notification order.
