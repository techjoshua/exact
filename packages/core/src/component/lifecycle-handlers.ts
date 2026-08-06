import type { ComponentInstance, LifecycleHandler, RenderEventHandler } from './contracts.js';

type LifecycleRegistrations = {
	mount?: LifecycleHandler[];
	activate?: LifecycleHandler[];
	deactivate?: LifecycleHandler[];
	unmount?: LifecycleHandler[];
	render?: RenderEventHandler[];
};

type LifecyclePhase = Exclude<keyof LifecycleRegistrations, 'render'>;

const registrations = new WeakMap<ComponentInstance<any>, LifecycleRegistrations>();
const emptyLifecycleHandlers: readonly LifecycleHandler[] = Object.freeze([]);
const emptyRenderHandlers: readonly RenderEventHandler[] = Object.freeze([]);

function registration(instance: ComponentInstance<any>): LifecycleRegistrations {
	let value = registrations.get(instance);
	if (!value) {
		value = {};
		registrations.set(instance, value);
	}
	return value;
}

/** Returns a mutable lifecycle phase list for internal compatibility and authored registration. */
export function mutableComponentLifecycleHandlers(
	instance: ComponentInstance<any>,
	phase: LifecyclePhase
): LifecycleHandler[] {
	const value = registration(instance);
	return (value[phase] ??= []);
}

/** Reads a lifecycle phase without allocating storage for components that do not use it. */
export function componentLifecycleHandlers(
	instance: ComponentInstance<any>,
	phase: LifecyclePhase
): readonly LifecycleHandler[] {
	return registrations.get(instance)?.[phase] ?? emptyLifecycleHandlers;
}

/** Returns a mutable render-listener list for internal compatibility and authored registration. */
export function mutableComponentRenderHandlers(
	instance: ComponentInstance<any>
): RenderEventHandler[] {
	const value = registration(instance);
	return (value.render ??= []);
}

/** Reads render listeners without allocating storage for components that do not observe renders. */
export function componentRenderHandlers(
	instance: ComponentInstance<any>
): readonly RenderEventHandler[] {
	return registrations.get(instance)?.render ?? emptyRenderHandlers;
}

/** Releases handler arrays after component teardown, including when inspection retains the shell. */
export function clearComponentLifecycleHandlers(instance: ComponentInstance<any>): void {
	registrations.delete(instance);
}
