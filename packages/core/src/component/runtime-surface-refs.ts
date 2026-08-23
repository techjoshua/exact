import type { AnyComponentInstance, RefKey } from './contracts.js';
import { componentRefCapability } from './ref-capability.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

function ref<T>(this: AnyComponentInstance, key: RefKey<T>) {
	return componentRefCapability().ref(this, key);
}

function readRef<T>(this: AnyComponentInstance, key: RefKey<T>): T | undefined {
	return componentRefCapability().read(this, key);
}

registerComponentRuntimeSurface({
	refs: {
		configurable: true,
		get(this: AnyComponentInstance) {
			return componentRefCapability().registry(this);
		}
	},
	ref: { configurable: true, writable: true, value: ref },
	readRef: { configurable: true, writable: true, value: readRef }
});
