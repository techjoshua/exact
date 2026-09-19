import type { mountTextHostPresentation } from './text-host-presentation.js';
import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../types.js';

const capabilityKey = Symbol.for('@exactjs/dom.text-host-capability.v2');
type Host = typeof globalThis & { [capabilityKey]?: typeof mountTextHostPresentation };

/** Installs component-aware text presentation when a text-host artifact is loaded. */
export function registerTextHostCapability(capability: typeof mountTextHostPresentation): void {
	(globalThis as Host)[capabilityKey] ??= capability;
}

/** Selects text presentation without retaining its implementation in ordinary element bundles. */
export function mountTextHost(
	root: Root,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	scope: EffectScope,
	existing?: Text
): Mounted {
	const capability = (globalThis as Host)[capabilityKey];
	if (!capability) throw new Error('Text host rendering requires the compiler-selected capability');
	return capability(root, children, parent, scope, existing);
}
