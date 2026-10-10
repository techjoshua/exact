import { createServerSlot } from '@exactjs/core/runtime/render-operations';
import { readServerSlotReceipt } from '@exactjs/core/runtime/component-abi';
import { unwrap } from '@exactjs/reactive/framework/values';
import {
	serverComponentProps,
	type ServerComponentReference
} from './server-component-reference.js';
import type { SsrContext } from '../types.js';
import { serverSlotId, serverSlotPayload, serverSlotReceiptReference } from './server-slots.js';

/** Keeps server-authored children under their provider while publishing a retained range to its client owner. */
export function prepareResumptionChildren(
	component: ServerComponentReference,
	id: string,
	context: SsrContext
): Readonly<{ component: ServerComponentReference; props: Record<string, unknown> }> {
	const constructionProps = serverComponentProps(component);
	if (!Object.hasOwn(constructionProps, 'children')) return { component, props: constructionProps };
	const authoredChildren: unknown = constructionProps.children;
	const children: unknown = unwrap(authoredChildren);
	if (children === null || typeof children !== 'object') {
		// Scalar children need no retained range. Preserve the construction bag when
		// unwrapping made no change to a data property. Accessors must still become a
		// snapshot, otherwise publication could read a different child after rendering.
		const descriptor = Object.getOwnPropertyDescriptor(constructionProps, 'children')!;
		const props =
			'value' in descriptor && children === authoredChildren
				? constructionProps
				: { ...constructionProps, children };
		if (component.children.length === 0 && props === component.props) return { component, props };
		return { component: { ...component, props, children: [] }, props };
	}
	const existing = readServerSlotReceipt(children);
	const slot = existing ? serverSlotReceiptReference(existing) : { id: serverSlotId(id) };
	return {
		component: {
			...component,
			children: [],
			props: {
				...constructionProps,
				children: existing ? children : createServerSlot(slot.id, {}, children)
			}
		},
		props: { ...constructionProps, children: serverSlotPayload(slot, context) }
	};
}
