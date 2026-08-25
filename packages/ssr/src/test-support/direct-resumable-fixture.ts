import {
	exactComponentContract,
	exactComponentType
} from '@exactjs/core/framework/component-contracts';
import { constructRenderComponentInstance } from '@exactjs/core/runtime/component-construction/render';
import { createVNode } from './native-vnode.js';

/** Attaches the smallest prepared contract used by direct-frame resumption fixtures. */
export function directResumableFixture<Props extends Record<string, unknown>>(
	name: string,
	statePaths: readonly string[],
	implementation: (
		this: { state: Record<string, unknown> },
		props: Props
	) => () => ReturnType<typeof createVNode>,
	classification: 'synchronous' | 'scheduled' = 'synchronous',
	stateInputs: readonly (readonly [string, string])[] = []
) {
	const componentId = `component:${name}`;
	return Object.assign(implementation, {
		[exactComponentType]: componentId,
		[exactComponentContract]: {
			version: 2 as const,
			placement: 'isomorphic' as const,
			role: 'client' as const,
			implementations: [
				{
					id: `implementation:${name}`,
					name,
					role: 'root' as const,
					implementation
				}
			],
			continuations: [],
			executors: [],
			boundaries: [],
			definition: {
				version: 1 as const,
				instantiate: implementation,
				construct: constructRenderComponentInstance,
				abi: 1,
				capabilities: ['resumption'] as const,
				state: statePaths,
				props: [],
				server: {
					version: 1 as const,
					classification,
					lane: 'direct' as const,
					deferredTaskProps: [],
					render: implementation
				}
			},
			resumption: {
				componentId,
				statePaths,
				stateInputs,
				valueCaptures: [],
				contexts: [],
				boundaries: []
			}
		}
	});
}
