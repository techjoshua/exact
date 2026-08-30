import type { ExactServerBoundaryReceiptData } from '@exactjs/core/runtime/component-abi';
import type { AnyComponentInstance, Child, SsrContext } from '../types.js';
import { ssrCapabilities } from './capability-registry.js';

type ChunkRenderer = (
	child: Child,
	parent: AnyComponentInstance | undefined,
	depth: number
) => Generator<string>;
type MarkerRenderer = (id: string, content: () => Generator<string>) => Generator<string>;
type ServerBoundaryChunkCapability = (
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined,
	depth: number,
	renderChild: ChunkRenderer,
	marked: MarkerRenderer
) => Generator<string>;

const capabilityName = 'server-boundary-chunks';

/** Installs chunked client-boundary rendering for artifacts that emit client boundaries. */
export function registerServerBoundaryChunkCapability(next: ServerBoundaryChunkCapability): void {
	ssrCapabilities[capabilityName] = next;
}

/** Streams an explicitly compiler-selected client boundary. */
export function renderServerBoundaryChunks(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined,
	depth: number,
	renderChild: ChunkRenderer,
	marked: MarkerRenderer
): Generator<string> {
	const capability = ssrCapabilities[capabilityName] as ServerBoundaryChunkCapability | undefined;
	if (!capability)
		throw new TypeError('Server boundary rendering requires its compiler capability');
	return capability(context, boundary, parent, depth, renderChild, marked);
}
