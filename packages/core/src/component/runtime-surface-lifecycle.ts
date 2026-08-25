import type { AnyComponentInstance, LifecycleHandler, RenderEventHandler } from './contracts.js';
import {
	mutableComponentLifecycleHandlers,
	mutableComponentRenderHandlers,
	registerComponentLifecycleHandler
} from './lifecycle-handlers.js';
import { disposeComponentResource } from './resource-ownership.js';
import { registerComponentRuntimeSurface } from './runtime-surface-registration.js';

function onMount(this: AnyComponentInstance, handler: LifecycleHandler): void {
	registerComponentLifecycleHandler(this, 'mount', handler);
}

function onActivate(this: AnyComponentInstance, handler: LifecycleHandler): void {
	registerComponentLifecycleHandler(this, 'activate', handler);
}

function onDeactivate(this: AnyComponentInstance, handler: LifecycleHandler): void {
	registerComponentLifecycleHandler(this, 'deactivate', handler);
}

function onUnmount(this: AnyComponentInstance, handler: LifecycleHandler): void {
	registerComponentLifecycleHandler(this, 'unmount', handler);
}

function onRender(this: AnyComponentInstance, handler: RenderEventHandler): void {
	mutableComponentRenderHandlers(this).push(handler);
}

function own<T extends Disposable | AsyncDisposable | { dispose(): unknown }>(
	this: AnyComponentInstance,
	resource: T
): T {
	this.onUnmount(() => disposeComponentResource(resource));
	return resource;
}

registerComponentRuntimeSurface({
	mountHandlers: {
		configurable: true,
		get(this: AnyComponentInstance) {
			return mutableComponentLifecycleHandlers(this, 'mount');
		}
	},
	activateHandlers: {
		configurable: true,
		get(this: AnyComponentInstance) {
			return mutableComponentLifecycleHandlers(this, 'activate');
		}
	},
	deactivateHandlers: {
		configurable: true,
		get(this: AnyComponentInstance) {
			return mutableComponentLifecycleHandlers(this, 'deactivate');
		}
	},
	unmountHandlers: {
		configurable: true,
		get(this: AnyComponentInstance) {
			return mutableComponentLifecycleHandlers(this, 'unmount');
		}
	},
	renderHandlers: {
		configurable: true,
		get(this: AnyComponentInstance) {
			return mutableComponentRenderHandlers(this);
		}
	},
	onMount: { configurable: true, writable: true, value: onMount },
	onActivate: { configurable: true, writable: true, value: onActivate },
	onDeactivate: { configurable: true, writable: true, value: onDeactivate },
	onUnmount: { configurable: true, writable: true, value: onUnmount },
	onRender: { configurable: true, writable: true, value: onRender },
	own: { configurable: true, writable: true, value: own }
});
