import type { Child } from '@exactjs/core';
import type { HydrationScriptOptions, RenderToStringOptions } from '../types.js';
import { readServerComponentReference } from './server-component-reference.js';

/** Resolves explicit root-prop publication once so render and resumption share one object graph. */
export function rootPropsOptions<T extends RenderToStringOptions & HydrationScriptOptions>(
	root: Child,
	options: T
): T {
	if (!options.publishRootProps) return options;
	if (options.state !== undefined)
		throw new TypeError('publishRootProps cannot be combined with an explicit hydration state');
	const receipt = readServerComponentReference(root);
	if (receipt) return { ...options, state: { ...receipt.props } };
	throw new TypeError('publishRootProps requires a compiler-issued component root operation');
}

/** Returns compiler identity only for a native component root. */
export function rootComponentIdentity(root: Child): string | undefined {
	const receipt = readServerComponentReference(root);
	return receipt?.contract.artifact.id;
}
