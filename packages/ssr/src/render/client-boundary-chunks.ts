import { unwrap } from '@exactjs/reactive/framework/values';
import { escapeAttr } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import { markerId } from '../markup.js';
import type { AnyComponentInstance, Child, SsrContext } from '../types.js';
import type { VNode } from '@exactjs/core';
import {
	clientBoundaryProps,
	clientBoundarySerializationMessage,
	serverBoundarySlotReferences,
	serverSlotId,
	serverSlotOpening
} from './boundaries.js';

type ChunkRenderer = (
	child: Child,
	parent: AnyComponentInstance | undefined,
	depth: number
) => Generator<string>;
type MarkerRenderer = (id: string, content: () => Generator<string>) => Generator<string>;

/** Renders one client-island boundary and each independently owned nested server range. */
export function* renderClientBoundaryChunks(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	depth: number,
	renderChild: ChunkRenderer,
	marked: MarkerRenderer
): Generator<string> {
	const id = String(unwrap(vnode.props.id) ?? '');
	const name = String(unwrap(vnode.props.name) ?? '');
	const props = clientBoundaryProps(context, vnode);
	const unsafePath = jsonUnsafePath(props);
	if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	const slots = serverBoundarySlotReferences(vnode);
	yield* marked(markerId(context, 'client-boundary', name, id), function* () {
		yield `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}">`;
		if (slots) {
			for (let index = 0; index < vnode.children.length; index++) {
				yield serverSlotOpening(slots[index]!, context);
				yield* renderChild(vnode.children[index]!, parent, depth + 1);
				yield '</span>';
			}
		} else if (vnode.children.length) {
			yield `<span data-exact-server-slot="${escapeAttr(serverSlotId(id))}" style="display: contents;">`;
			for (const child of vnode.children) yield* renderChild(child, parent, depth + 1);
			yield '</span>';
		}
		yield '</div>';
	});
}
