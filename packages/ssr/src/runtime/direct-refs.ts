import {
	componentRefBindingOwner,
	registerComponentRefBindingOwner
} from '@exactjs/core/framework/ref-bindings';
import type {
	AnyComponentInstance,
	RefBinding,
	RefKey,
	RefRegistry,
	RootBinding,
	RootLifecycle
} from '@exactjs/core';

type DirectRefOwner = object;
type DirectRefMethod = <T>(key: RefKey<T>) => RefBinding<T>;

type DirectRefRecord = {
	readonly bindings: Map<symbol, DirectRefBinding<unknown>>;
	root?: RootLifecycle<object>;
	explicit?: RefBinding<object>;
	augmented?: RootBinding<object>;
};

const records = new WeakMap<DirectRefOwner, DirectRefRecord>();
const refMethods = new WeakMap<DirectRefOwner, DirectRefMethod>();
const readMethods = new WeakMap<DirectRefOwner, RefRegistry['get']>();
const refsFacades = new WeakMap<DirectRefOwner, RefRegistry>();

class DirectRefBinding<T> implements RefBinding<T> {
	current: T | undefined;

	constructor(
		readonly owner: AnyComponentInstance,
		readonly key: RefKey<T>
	) {
		registerComponentRefBindingOwner(this, owner);
	}

	fulfill(value: T | undefined): void {
		this.current = value;
	}
}

/** Returns the stable request-local binding for one compiler-owned SSR ref operation. */
export function directSsrRef<T>(owner: DirectRefOwner, key: RefKey<T>): RefBinding<T> {
	const record = refRecord(owner);
	const existing = record.bindings.get(key.id) as DirectRefBinding<T> | undefined;
	if (existing) return existing;
	const binding = new DirectRefBinding(owner as AnyComponentInstance, key);
	record.bindings.set(key.id, binding as DirectRefBinding<unknown>);
	return binding;
}

/** Reads a request-local SSR binding without installing the client ref capability. */
export function directSsrReadRef<T>(owner: DirectRefOwner, key: RefKey<T>): T | undefined {
	return records.get(owner)?.bindings.get(key.id)?.current as T | undefined;
}

/** Returns the stable extracted `this.ref` method for a request-local frame. */
export function directSsrRefMethod(owner: DirectRefOwner): DirectRefMethod {
	let method = refMethods.get(owner);
	if (!method) {
		method = <T>(key: RefKey<T>) => directSsrRef(owner, key);
		refMethods.set(owner, method);
	}
	return method;
}

/** Returns the stable extracted `this.readRef` method for a request-local frame. */
export function directSsrReadRefMethod(owner: DirectRefOwner): RefRegistry['get'] {
	let method = readMethods.get(owner);
	if (!method) {
		method = <T>(key: RefKey<T>) => directSsrReadRef(owner, key);
		readMethods.set(owner, method);
	}
	return method;
}

/** Returns the stable focused `this.refs` facade for an extracted server reference surface. */
export function directSsrRefs(owner: DirectRefOwner): RefRegistry {
	let facade = refsFacades.get(owner);
	if (!facade) {
		facade = {
			get: directSsrReadRefMethod(owner),
			root: ((binding?: RefBinding<object>) =>
				binding
					? directSsrRoot(owner, binding)
					: directSsrRoot<object>(owner)) as RefRegistry['root']
		};
		refsFacades.set(owner, facade);
	}
	return facade;
}

/** Returns the stable empty server root lifecycle, optionally attached to an owned binding. */
export function directSsrRoot<T extends object>(owner: DirectRefOwner): RootLifecycle<T>;
/** Attaches a compiler-owned binding to the stable request-local server root lifecycle. */
export function directSsrRoot<T extends object>(
	owner: DirectRefOwner,
	binding: RefBinding<T>
): RootBinding<T>;
export function directSsrRoot<T extends object>(
	owner: DirectRefOwner,
	binding?: RefBinding<T>
): RootLifecycle<T> | RootBinding<T> {
	const record = refRecord(owner);
	const lifecycle = (record.root ??= {
		current: undefined,
		generation: 0,
		introduction: undefined,
		presented: false,
		release: undefined
	}) as RootLifecycle<T>;
	if (!binding) return lifecycle;
	if (componentRefBindingOwner(binding) !== owner)
		throw new Error('A component root binding must be owned by the component selecting it');
	if (record.explicit && record.explicit !== binding)
		throw new Error('A component may select only one explicit root binding');
	record.explicit = binding as RefBinding<object>;
	if (record.augmented) return record.augmented as RootBinding<T>;
	const augmented = Object.defineProperties(binding, {
		generation: { enumerable: true, get: () => lifecycle.generation },
		introduction: { enumerable: true, get: () => lifecycle.introduction },
		presented: { enumerable: true, get: () => lifecycle.presented },
		release: { enumerable: true, get: () => lifecycle.release }
	}) as RootBinding<T>;
	record.augmented = augmented as RootBinding<object>;
	return augmented;
}

function refRecord(owner: DirectRefOwner): DirectRefRecord {
	let record = records.get(owner);
	if (!record) {
		record = { bindings: new Map() };
		records.set(owner, record);
	}
	return record;
}
