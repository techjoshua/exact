import type { AnyComponentInstance, RenderFunction } from '@exactjs/core';
import { realmSsrCapability, registerRealmSsrCapability } from './realm-capability.js';

type SsrConstructionErrorHandler = (
	parent: AnyComponentInstance | undefined,
	error: unknown,
	componentName: string
) => RenderFunction | undefined;

const capabilityName = 'construction-error-handler';

/** Installs error-boundary fallback behavior for artifacts that require generic component ownership. */
export function registerSsrConstructionErrorHandler(next: SsrConstructionErrorHandler): void {
	registerRealmSsrCapability(capabilityName, next);
}

/** Routes a construction failure through an installed boundary or preserves the original failure. */
export function handleSsrConstructionError(
	parent: AnyComponentInstance | undefined,
	error: unknown,
	componentName: string
): RenderFunction | undefined {
	const handler = realmSsrCapability<SsrConstructionErrorHandler>(capabilityName);
	if (!handler) throw error;
	return handler(parent, error, componentName);
}
