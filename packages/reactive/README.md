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

The package includes reactive objects and collections, signals, computed values, watchers,
batching, effect scopes, scheduling priorities, equality controls, and external-source support.
Arrays, `Map`, and `Set` retain their familiar JavaScript operations.

For application task and optimistic-state patterns, see
[actions and forms](../../docs/actions-and-forms.md).
