# @exactjs/reactive

Fine-grained reactive primitives and proxy-backed observable state used by eXact components.

The package provides signals, computed values, dependency tracking, batching, scheduling,
equality, effect scopes, observations, collection handling, and external-source integration.

```ts
import { computed, reactive } from '@exactjs/reactive';

const state = reactive({ quantity: 2, price: 5 });
const subtotal = computed(() => state.quantity * state.price);
```

Component authors usually mutate `this.state` directly and let the compiler/runtime manage these
primitives. Use the low-level APIs when building framework integrations or explicit reactive
models.
