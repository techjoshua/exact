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

Framework work is scheduled at `interactive`, `normal`, or `deferred` priority. Effect scopes can
be paused and resumed without disposal; invalidations received while paused settle once after
reactivation.

The package also owns the internal mutation journals used by component actions. Journals track
object paths, array sequences, Map entries, and Set memberships so optimistic rollback preserves
later authoritative writes. Application code reaches that behavior through `this.action()` rather
than calling journal internals.

See [Actions, interactions, optimistic state, and forms](../../docs/actions-and-forms.md).

Framework integrations may supply `ReactiveOptions.onMutation` to observe a mutation key and
operation after the reactive write. The callback is diagnostic-only: failures are isolated and it
must not read application values, add dependencies, or alter scheduling. eXact component domains
use this boundary for value-free DevTools state-change records.
