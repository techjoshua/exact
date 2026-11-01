import { captureComponentRootLifetime } from '@exactjs/dom/framework/component-root';
import type { CoreHydrationRoot } from '../types.js';

/** Provides the canonical roots value. */
export const roots = new WeakMap<Element, CoreHydrationRoot & { ownsDomRoot?: () => boolean }>();

/** Assigns this client only the renderer attempt accepted by its hydration call. */
export function ownHydrationDomRoot(root: CoreHydrationRoot, isCurrent: () => boolean): void {
	(root as CoreHydrationRoot & { ownsDomRoot?: () => boolean }).ownsDomRoot = isCurrent;
}

/** Unbound standalone clients preserve their existing disposal contract. */
export function hydrationOwnsDomRoot(root: CoreHydrationRoot): boolean {
	return (root as CoreHydrationRoot & { ownsDomRoot?: () => boolean }).ownsDomRoot?.() ?? true;
}

/** Provides the canonical request versions value. */
export const requestVersions = new WeakMap<Element, Map<string, number>>();

/** Transfers disposal to the committed mount, without weakening acquisition attempt fences. */
export function acceptHydrationDomRoot(root: CoreHydrationRoot, container: Element): void {
	const ownsLifetime = captureComponentRootLifetime(container);
	if (ownsLifetime) ownHydrationDomRoot(root, ownsLifetime);
}
