import type { ReactiveValue } from '@exactjs/reactive/framework/runtime';
import type { AnyComponentInstance, Child } from './contracts.js';
import { componentListCapability } from './list-capability.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

function map<T>(
	this: AnyComponentInstance,
	collection: Iterable<T> | ReactiveValue<Iterable<T>>,
	key: (item: T) => string,
	render: (item: T) => Child,
	id?: string,
	provenance?: Iterable<T>,
	keyIdentity?: string
): Child {
	return componentListCapability().map(this, collection, key, render, id, provenance, keyIdentity);
}

registerComponentRuntimeSurface({
	map: { configurable: true, writable: true, value: map }
});
