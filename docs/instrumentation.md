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

- Expressions: configuration, TypeScript programs, diagnostics, and module projection.
  `profileDetail: "detailed"` additionally divides projection into identity,
  node conversion, and finalization stages. Node conversion is split into
  exclusive metadata, type, binding, common-node, specialization, and
  unclassified-overhead timings with checker and cache counters. Type
  projection is further attributed exclusively to display formatting, union
  members, call signatures, properties and shallow summaries, generic
  arguments, directives, and immutable object construction.
- Compiler: expression modules, invalidation, clearing, and nested expression work.
- Reactive: scheduler flushes owned by `createProfiledEffectScope`.
- DOM: root rendering and traversal counts.
- Hydrate: hydration, including nested DOM events when the same sink is passed.
- Server: complete request protocol handling.
- SSR: synchronous string rendering and stream construction.
- React compatibility: render and commit work created inside `withReactProfile`.
- Vite, webpack, and Bun plugins: compiler and expression events through `onProfile`.

`stats()` remains the retained-state interface. Profiling events describe where
time was spent, while benchmark scripts determine whether performance changed.

Detailed expression profiling reads the high-resolution clock several times per
syntax node. Keep the default `summary` detail for routine telemetry and enable
`detailed` only during a focused performance investigation. The corpus check
uses detailed mode and writes its complete structured report to
`.tmp/expression-corpus-profile.json`.

The corpus check also records elapsed time and peak worker RSS. Its default
policy uses one worker, a 1 GB JavaScript heap guardrail, and batches of 16 files.
Runtime is measured, not enforced as a timeout. Every run is appended to the ignored
`.tmp/expression-corpus-history.json`; the latest successful comparison point is
tracked in `docs/performance-baselines/expression-corpus.json`. Run
`npm run check:expressions:baseline` only when intentionally accepting a new
baseline. `EXACT_EXPRESSION_WORKER_HEAP_MB`, `EXACT_EXPRESSION_BATCH_SIZE`, and
`EXACT_EXPRESSION_WORKERS` provide explicit investigation overrides without
changing the repository policy.

## Isolation

Option-bearing runtimes receive sinks directly. Reactive and React compatibility
use explicit ownership scopes so profiling from concurrent roots is not sent to
an unrelated application. No package enables a process-wide profiler.
