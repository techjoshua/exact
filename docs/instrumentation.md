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

## Component performance traces

The nearest component `LoggerContext` can enable the `trace` level at runtime to
observe fine-grained interaction and task timing without installing a global
collector. Framework-owned trace records use the component identity already
attached to `this.log` and place a structured timing record in `data`:

- `operation` is `interaction` or `task`;
- `operationId` correlates every mark for one operation;
- `phase` identifies `started`, `handler-complete`, `feedback-committed`,
  `optimistic-applied`, or `settled`;
- `elapsedMs` is measured from that operation's start; and
- `attributes` carries bounded values such as source, priority, generation,
  interaction identity, and settlement outcome.

Interaction settlement includes its structurally attached task subtree. Task
settlement is recorded after optimistic journals are published or rolled back.
The DOM renderer records `handler-complete` after the synchronous authored
callback and `feedback-committed` after the interactive synchronous flush. The
feedback mark includes the number of child-reconciliation passes and traversed
render values, separating handler, renderer, and server/task settlement costs.
The `logger` supplied to `render()` or hydration is also the ambient component
logger for that root, including directly adopted hydrated component roots.

These calls are not removed from production artifacts. When trace logging is
disabled, the framework does not read a timestamp, create a span, attach
settlement observers, describe DOM nodes, or evaluate trace arguments and
attributes. Enabling the logger at runtime affects the next operation.

`stats()` remains the retained-state interface. Profiling events describe where
time was spent, while benchmark scripts determine whether performance changed.

The native compiler corpus records median end-to-end elapsed time, individual
samples, output size, and compiler phase timings for both the corpus and each
project in `.tmp/native-compiler-corpus.json`. A separate warmed single-edit
pass records program rebuilds, affected and reused sources, component link
walks, callable analyses, and cache hits. Its throughput is compared with
stable project/file-count pairs in
`docs/performance-baselines/native-compiler-corpus.json`, so adding a large
project does not masquerade as a compiler regression. The guard considers both
aggregate matched-project worker time and significant individual-project
regressions; per-project incremental ratios below a 50 ms baseline are reported
but excluded from the ratio guard because scheduler noise dominates them. Run
`npm run check:native-compiler-corpus:baseline` only when intentionally
accepting a new native baseline. `EXACT_NATIVE_CORPUS_WORKERS`,
`EXACT_NATIVE_CORPUS_PROJECT`, `EXACT_NATIVE_CORPUS_SAMPLES`, and
`EXACT_NATIVE_CORPUS_MAX_BASELINE_RATIO` provide focused investigation
overrides without changing repository policy.

## Isolation

Option-bearing runtimes receive sinks directly. Reactive and React compatibility
use explicit ownership scopes so profiling from concurrent roots is not sent to
an unrelated application. No package enables a process-wide profiler.
