import { reactive, type Reactive } from '@exactjs/reactive';
import type { ComponentInstance, RefBinding, RefKey, RefRegistry } from './contracts.js';
import { bindComponentRoot, componentRootLifecycle } from './root-lifecycle.js';

type RefOwner = ComponentInstance<any> & {
	readRef<T>(key: RefKey<T>): T | undefined;
};

class ComponentRefBinding<T> implements RefBinding<T> {
	readonly owner: ComponentInstance<any>;
	readonly key: RefKey<T>;
	private readonly slot: Reactive<{ current: T | undefined }>;

	constructor(owner: ComponentInstance<any>, key: RefKey<T>) {
		this.owner = owner;
		this.key = key;
		this.slot = reactive({ current: undefined as T | undefined }, { passthroughKeys: ['current'] });
	}

	get current(): T | undefined {
		return this.slot.current;
	}

	fulfill(value: T | undefined): void {
		this.slot.current = value;
	}
}

class ComponentRefRegistry implements RefRegistry {
	constructor(private readonly owner: RefOwner) {}

	get<T>(key: RefKey<T>): T | undefined {
		return this.owner.readRef(key);
	}

	root<T extends object = object>(): ReturnType<typeof componentRootLifecycle<T>>;
	root<T extends object>(binding: RefBinding<T>): ReturnType<typeof bindComponentRoot<T>>;
	root<T extends object>(binding?: RefBinding<T>) {
		return binding ? bindComponentRoot(this.owner, binding) : componentRootLifecycle<T>(this.owner);
	}
}

/** Creates the lazily materialized ref-registry facade for one component. */
export function createComponentRefRegistry(owner: RefOwner): RefRegistry {
	return new ComponentRefRegistry(owner);
}

/** Creates a component-owned reactive ref binding with shared methods. */
export function createComponentRefBinding<T>(
	owner: ComponentInstance<any>,
	key: RefKey<T>
): RefBinding<T> {
	return new ComponentRefBinding(owner, key);
}
