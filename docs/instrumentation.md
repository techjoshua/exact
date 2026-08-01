# Optional instrumentation

eXact packages expose profiling through the dependency-free
`@exactjs/instrumentation` contract. Instrumentation is disabled by default and
does not install global collectors.

```ts
import { createProfileCollector, summarizeProfile } from '@exactjs/instrumentation';
import { createCompilerSession } from '@exactjs/compiler';

const profile = createProfileCollector();
const session = createCompilerSession({ onProfile: profile.sink });

// Run compiler work.

console.table(summarizeProfile(profile.snapshot()));
session.dispose();
```

## Event contract

Every event contains a `subsystem`, `phase`, and `elapsedMs`. Packages may add
strongly typed fields, serializable attributes, or numeric counts. Sinks run
synchronously and must return quickly; applications that export traces should
enqueue events and perform I/O outside the measured operation.

## Instrumented boundaries

- Compiler: native requests, project invalidation, and session clearing.
- Reactive: scheduler flushes owned by `createProfiledEffectScope`.
- DOM: root rendering and traversal counts.
- Hydrate: hydration, including nested DOM events when the same sink is passed.
- Server: complete request protocol handling.
- SSR: synchronous string rendering and stream construction.
- React compatibility: render and commit work created inside `withReactProfile`.
- Vite, webpack, and Bun plugins: compiler events through `onProfile`.

`stats()` remains the retained-state interface. Profiling events describe where
time was spent, while benchmark scripts determine whether performance changed.

The native compiler corpus records end-to-end elapsed time, output size, and
compiler phase timings in `.tmp/native-compiler-corpus.json`. Its throughput is
compared with `docs/performance-baselines/native-compiler-corpus.json`; run
`npm run check:native-compiler-corpus:baseline` only when intentionally
accepting a new native baseline. `EXACT_NATIVE_CORPUS_WORKERS`,
`EXACT_NATIVE_CORPUS_PROJECT`, and `EXACT_NATIVE_CORPUS_MAX_BASELINE_RATIO`
provide focused investigation overrides without changing repository policy.

## Isolation

Option-bearing runtimes receive sinks directly. Reactive and React compatibility
use explicit ownership scopes so profiling from concurrent roots is not sent to
an unrelated application. No package enables a process-wide profiler.
