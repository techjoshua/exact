import type { AnyComponentInstance, RefBinding, RefKey } from './contracts.js';
import { registerComponentRefCapability } from './ref-capability.js';
import { createComponentRefBinding, createComponentRefRegistry } from './ref-runtime.js';

const registries = new WeakMap<object, ReturnType<typeof createComponentRefRegistry>>();
const bindings = new WeakMap<object, Map<symbol, RefBinding<unknown>>>();

function registry(owner: object): ReturnType<typeof createComponentRefRegistry> {
	let value = registries.get(owner);
	if (!value) {
		value = createComponentRefRegistry(
			owner as AnyComponentInstance & {
				readRef<T>(key: RefKey<T>): T | undefined;
			}
		);
		registries.set(owner, value);
	}
	return value;
}

registerComponentRefCapability(
	Object.freeze({
		registry,
		ref<T>(owner: object, key: RefKey<T>): RefBinding<T> {
			let owned = bindings.get(owner);
			if (!owned) bindings.set(owner, (owned = new Map()));
			const existing = owned.get(key.id) as RefBinding<T> | undefined;
			if (existing) return existing;
			const binding = createComponentRefBinding(owner as AnyComponentInstance, key);
			owned.set(key.id, binding as RefBinding<unknown>);
			return binding;
		},
		read<T>(owner: object, key: RefKey<T>): T | undefined {
			return bindings.get(owner)?.get(key.id)?.current as T | undefined;
		}
	})
);
