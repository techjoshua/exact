import { escapeAttr } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import { markerId } from '../markup.js';
import type { AnyComponentInstance, Child, SsrContext } from '../types.js';
import type { ExactServerBoundaryReceiptData } from '@exactjs/core/runtime/component-abi';
import { clientBoundaryProps, serverBoundarySlotReferences } from './boundaries.js';
import { clientBoundarySerializationMessage } from './client-boundary-validation.js';
import { serverSlotId, serverSlotOpening } from './server-slots.js';

type ChunkRenderer = (
	child: Child,
	parent: AnyComponentInstance | undefined,
	depth: number
) => Generator<string>;
type MarkerRenderer = (id: string, content: () => Generator<string>) => Generator<string>;

/** Renders one client-island boundary and each independently owned nested server range. */
export function* renderClientBoundaryChunks(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined,
	depth: number,
	renderChild: ChunkRenderer,
	marked: MarkerRenderer
): Generator<string> {
	const { id, name } = boundary;
	const props = clientBoundaryProps(context, boundary);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	const slots = serverBoundarySlotReferences(boundary);
	yield* marked(markerId(context, 'client-boundary', name, id), function* () {
		yield `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">`;
		if (slots) {
			for (let index = 0; index < boundary.children.length; index++) {
				yield serverSlotOpening(slots[index]!, context);
				yield* renderChild(boundary.children[index]!, parent, depth + 1);
				yield '</span>';
			}
		} else if (boundary.children.length) {
			yield `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">`;
			for (const child of boundary.children) yield* renderChild(child, parent, depth + 1);
			yield '</span>';
		}
		yield '</div>';
	});
}
