import type { AnyComponentInstance, RenderFunction } from '@exactjs/core';

type SsrConstructionErrorHandler = (
	parent: AnyComponentInstance | undefined,
	error: unknown,
	componentName: string
) => RenderFunction | undefined;

let handler: SsrConstructionErrorHandler | undefined;

/** Installs error-boundary fallback behavior for artifacts that require generic component ownership. */
export function registerSsrConstructionErrorHandler(next: SsrConstructionErrorHandler): void {
	handler = next;
}

/** Routes a construction failure through an installed boundary or preserves the original failure. */
export function handleSsrConstructionError(
	parent: AnyComponentInstance | undefined,
	error: unknown,
	componentName: string
): RenderFunction | undefined {
	if (!handler) throw error;
	return handler(parent, error, componentName);
}
