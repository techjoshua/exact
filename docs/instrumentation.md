# Optional instrumentation

eXact packages expose profiling through the dependency-free
`@exact/instrumentation` contract. Instrumentation is disabled by default and
does not install global collectors.

```ts
import { createProfileCollector, summarizeProfile } from '@exact/instrumentation';
import { createCompilerSession } from '@exact/compiler';

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

## Isolation

Option-bearing runtimes receive sinks directly. Reactive and React compatibility
use explicit ownership scopes so profiling from concurrent roots is not sent to
an unrelated application. No package enables a process-wide profiler.
