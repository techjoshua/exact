import type { AnyComponentInstance, LifecycleHandler, RenderEventHandler } from './contracts.js';

type LifecycleRegistrations = {
	mount?: LifecycleHandler[];
	activate?: LifecycleHandler[];
	deactivate?: LifecycleHandler[];
	unmount?: LifecycleHandler[];
	render?: RenderEventHandler[];
};

type LifecyclePhase = Exclude<keyof LifecycleRegistrations, 'render'>;

const registrations = new WeakMap<AnyComponentInstance, LifecycleRegistrations>();
const emptyLifecycleHandlers: readonly LifecycleHandler[] = Object.freeze([]);
const emptyRenderHandlers: readonly RenderEventHandler[] = Object.freeze([]);

function registration(instance: AnyComponentInstance): LifecycleRegistrations {
	let value = registrations.get(instance);
	if (!value) {
		value = {};
		registrations.set(instance, value);
	}
	return value;
}

/** Returns a mutable lifecycle phase list for internal compatibility and authored registration. */
export function mutableComponentLifecycleHandlers(
	instance: AnyComponentInstance,
	phase: LifecyclePhase
): LifecycleHandler[] {
	const value = registration(instance);
	return (value[phase] ??= []);
}

/** Registers one lifecycle callback through the renderer/compiler kernel contract. */
export function registerComponentLifecycleHandler(
	instance: AnyComponentInstance,
	phase: LifecyclePhase,
	handler: LifecycleHandler
): void {
	mutableComponentLifecycleHandlers(instance, phase).push(handler);
}

/** Registers one compiler-lowered render callback without exposing a prototype method. */
export function registerComponentRenderHandler(
	instance: AnyComponentInstance,
	handler: RenderEventHandler
): void {
	mutableComponentRenderHandlers(instance).push(handler);
}

/** Reads a lifecycle phase without allocating storage for components that do not use it. */
export function componentLifecycleHandlers(
	instance: AnyComponentInstance,
	phase: LifecyclePhase
): readonly LifecycleHandler[] {
	return registrations.get(instance)?.[phase] ?? emptyLifecycleHandlers;
}

/** Returns a mutable render-listener list for internal compatibility and authored registration. */
export function mutableComponentRenderHandlers(
	instance: AnyComponentInstance
): RenderEventHandler[] {
	const value = registration(instance);
	return (value.render ??= []);
}

/** Reads render listeners without allocating storage for components that do not observe renders. */
export function componentRenderHandlers(
	instance: AnyComponentInstance
): readonly RenderEventHandler[] {
	return registrations.get(instance)?.render ?? emptyRenderHandlers;
}

/** Releases handler arrays after component teardown, including when inspection retains the shell. */
export function clearComponentLifecycleHandlers(instance: AnyComponentInstance): void {
	registrations.delete(instance);
}
