import type { VNode } from '@exactjs/core';
import type { AnyComponentInstance, Child, SsrContext } from '../types.js';

type ChunkRenderer = (
	child: Child,
	parent: AnyComponentInstance | undefined,
	depth: number
) => Generator<string>;
type MarkerRenderer = (id: string, content: () => Generator<string>) => Generator<string>;
type ServerBoundaryChunkCapability = (
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number,
	renderChild: ChunkRenderer,
	marked: MarkerRenderer
) => Generator<string>;

let capability: ServerBoundaryChunkCapability | undefined;

/** Installs chunked client-boundary rendering for artifacts that emit client boundaries. */
export function registerServerBoundaryChunkCapability(
	next: ServerBoundaryChunkCapability
): void {
	capability = next;
}

/** Streams an explicitly compiler-selected client boundary. */
export function renderServerBoundaryChunks(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number,
	renderChild: ChunkRenderer,
	marked: MarkerRenderer
): Generator<string> {
	if (!capability) throw new TypeError('Server boundary rendering requires its compiler capability');
	return capability(context, vnode, parent, depth, renderChild, marked);
}
