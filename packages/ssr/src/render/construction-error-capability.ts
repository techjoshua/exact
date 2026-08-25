import type { AnyComponentInstance, RenderFunction } from '@exactjs/core';
import { ssrCapabilities } from './capability-registry.js';

type SsrConstructionErrorHandler = (
	parent: AnyComponentInstance | undefined,
	error: unknown,
	componentName: string
) => RenderFunction | undefined;

const capabilityName = 'construction-error-handler';

/** Installs error-boundary fallback behavior for artifacts that require generic component ownership. */
export function registerSsrConstructionErrorHandler(next: SsrConstructionErrorHandler): void {
	ssrCapabilities[capabilityName] = next;
}

/** Routes a construction failure through an installed boundary or preserves the original failure. */
export function handleSsrConstructionError(
	parent: AnyComponentInstance | undefined,
	error: unknown,
	componentName: string
): RenderFunction | undefined {
	const handler = ssrCapabilities[capabilityName] as SsrConstructionErrorHandler | undefined;
	if (!handler) throw error;
	return handler(parent, error, componentName);
}
