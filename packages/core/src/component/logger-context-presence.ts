import type { AnyComponentInstance } from './contracts.js';

const componentLoggerProviders = new WeakSet<AnyComponentInstance>();
let componentLoggerProviderCount = 0;

/** Records that a live component now owns a logger context. */
export function registerComponentLoggerProvider(instance: AnyComponentInstance): void {
	if (componentLoggerProviders.has(instance)) return;
	componentLoggerProviders.add(instance);
	componentLoggerProviderCount++;
}

/** Releases a component logger-provider registration during component teardown. */
export function releaseComponentLoggerProvider(instance: AnyComponentInstance): void {
	if (!componentLoggerProviders.delete(instance)) return;
	componentLoggerProviderCount--;
}

/** Reports whether parent traversal could currently discover a component logger override. */
export function hasComponentLoggerProviders(): boolean {
	return componentLoggerProviderCount !== 0;
}
