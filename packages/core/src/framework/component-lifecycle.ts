import type {
	AnyComponentInstance,
	Component,
	LifecycleHandler,
	RenderEventHandler
} from '../component/contracts.js';
import {
	registerComponentLifecycleHandler as registerInternalLifecycleHandler,
	registerComponentRenderHandler as registerInternalRenderHandler
} from '../component/lifecycle-handlers.js';
import { disposeComponentResource } from '../component/resource-ownership.js';

type LifecyclePhase = 'mount' | 'activate' | 'deactivate' | 'unmount';

/** Registers one compiler-lowered lifecycle callback against an authored component view. */
export function registerComponentLifecycleHandler<State extends object>(
	instance: Component<State>,
	phase: LifecyclePhase,
	handler: LifecycleHandler
): void {
	registerInternalLifecycleHandler(instance as unknown as AnyComponentInstance, phase, handler);
}

/** Registers one compiler-lowered post-render callback against an authored component view. */
export function registerComponentRenderHandler<State extends object>(
	instance: Component<State>,
	handler: RenderEventHandler
): void {
	registerInternalRenderHandler(instance as unknown as AnyComponentInstance, handler);
}

/** Transfers a compiler-lowered disposable value to its component's unmount lifetime. */
export function ownComponentResource<
	State extends object,
	T extends Disposable | AsyncDisposable | { dispose(): unknown }
>(instance: Component<State>, resource: T): T {
	registerComponentLifecycleHandler(instance, 'unmount', () => disposeComponentResource(resource));
	return resource;
}
