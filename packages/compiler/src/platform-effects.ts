import type { Variable } from '@exactjs/expressions';

/** Provides the canonical browser platform globals value. */
export const browserPlatformGlobals = new Set([
	'window',
	'document',
	'navigator',
	'location',
	'history',
	'localStorage',
	'sessionStorage',
	'HTMLElement',
	'Element',
	'Node',
	'MutationObserver',
	'ResizeObserver',
	'IntersectionObserver',
	'requestAnimationFrame',
	'cancelAnimationFrame',
	'requestIdleCallback',
	'cancelIdleCallback',
	'WebSocket',
	'EventSource',
	'BroadcastChannel',
	'Worker'
]);

/** Provides the canonical server platform globals value. */
export const serverPlatformGlobals = new Set([
	'process',
	'Buffer',
	'require',
	'__dirname',
	'__filename'
]);

/** Reports whether unshadowed platform global. */
export function isUnshadowedPlatformGlobal(
	name: string | undefined,
	variable: Variable | undefined,
	localVariables: ReadonlySet<Variable>
): 'browser' | 'server' | undefined {
	if (!name || (variable && localVariables.has(variable))) return undefined;
	if (browserPlatformGlobals.has(name)) return 'browser';
	if (serverPlatformGlobals.has(name)) return 'server';
	return undefined;
}
