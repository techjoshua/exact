# @exactjs/reactive

Fine-grained reactive primitives and observable collections used by eXact.

## When to use it

Component authors should normally read and mutate `this.state` directly. Use this package when
building a standalone reactive model, a reusable library abstraction, or a framework integration.

## Usage

```ts
import { computed, reactive } from '@exactjs/reactive';

const state = reactive({ quantity: 2, price: 5 });
const subtotal = computed(() => state.quantity * state.price);

state.quantity++;
console.log(subtotal.get());
```

Computed reads are lazy, cached, and synchronously current through transitive computed chains. A
read after a write settles only the required upstream graph; scheduled watchers and UI consequences
remain coalesced. Equal effective results stop downstream propagation, and a direct or indirect
computed cycle throws a bounded eXact diagnostic.

A standalone computed that has no watcher is pull-only. It retains enough source-version evidence
to validate a later read, but its sources do not retain it after that read. `watch()` or
`subscribe()` attaches the reverse edges needed for push scheduling and releases them when stopped.
Computeds created inside an effect scope remain scope-owned and release their dependencies when the
scope stops. `inspectComputed()` returns value-free status and bounded edge counts without observing
the value.

The package includes reactive objects and collections, computed values, watchers, batching, effect
scopes, scheduling priorities, structural result equality, and external-source support.
Arrays, `Map`, and `Set` retain their familiar JavaScript operations.

For application task and optimistic-state patterns, see
[actions and forms](../../docs/actions-and-forms.md).
