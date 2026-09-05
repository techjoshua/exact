import type { Child } from '@exactjs/core';
import type { ExactValueSerializationSchema } from '@exactjs/core/framework/component-contracts';
import type { HydrationScriptOptions, RenderToStringOptions } from '../types.js';
import { readServerComponentReference } from './server-component-reference.js';

const positionalRootPublication = Symbol('exact.positional-root-publication');

/** Request-owned source claimed by the hydration validator's positional traversal. */
export type PositionalRootPublication = Readonly<{
	componentId: string;
	props: Readonly<Record<string, unknown>>;
	schema: ExactValueSerializationSchema;
}>;

type PositionalRootState = {
	readonly [positionalRootPublication]?: PositionalRootPublication;
};

/** Resolves explicit root-prop publication once so render and resumption share one object graph. */
export function rootPropsOptions<T extends RenderToStringOptions & HydrationScriptOptions>(
	root: Child,
	options: T
): T {
	if (!options.publishRootProps) return options;
	if (options.state !== undefined)
		throw new TypeError('publishRootProps cannot be combined with an explicit hydration state');
	const receipt = readServerComponentReference(root);
	if (receipt) {
		const props = { ...receipt.props };
		const schema = receipt.contract.artifact.serialization;
		if (schema && !options.outputExtensions?.length) {
			const state: PositionalRootState = {};
			Object.defineProperty(state, positionalRootPublication, {
				value: { componentId: receipt.contract.artifact.id, props, schema }
			});
			return { ...options, state };
		}
		return { ...options, state: props };
	}
	throw new TypeError('publishRootProps requires a compiler-issued component root operation');
}

/** Returns the request-local root publication source without exposing its marker to JSON. */
export function readPositionalRootPublication(
	state: unknown
): PositionalRootPublication | undefined {
	return state && typeof state === 'object'
		? (state as PositionalRootState)[positionalRootPublication]
		: undefined;
}

/** Returns request-owned root props separately from their compact hydration representation. */
export function rootPropsForCapture(
	root: Child,
	options: RenderToStringOptions & HydrationScriptOptions
): Readonly<Record<string, unknown>> | undefined {
	if (!options.publishRootProps) return undefined;
	return readServerComponentReference(root)?.props;
}

/** Returns compiler identity only for a native component root. */
export function rootComponentIdentity(root: Child): string | undefined {
	const receipt = readServerComponentReference(root);
	return receipt?.contract.artifact.id;
}
