import { createServerSlot } from '@exactjs/core/runtime/render-operations';
import { readServerSlotReceipt } from '@exactjs/core/runtime/component-abi';
import { unwrap } from '@exactjs/reactive/framework/values';
import {
	serverComponentProps,
	deriveResumptionComponentInputs,
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
	const children: unknown = unwrap(constructionProps.children);
	if (children === null || typeof children !== 'object') {
		// Snapshot scalar accessors as well as reactive values before later publication.
		const inputs = deriveResumptionComponentInputs(component.inputs!, children, children);
		const props = inputs.publicationProps as Record<string, unknown>;
		return {
			component: {
				...component,
				props,
				children: [],
				inputs
			},
			props
		};
	}
	const existing = readServerSlotReceipt(children);
	const slot = existing ? serverSlotReceiptReference(existing) : { id: serverSlotId(id) };
	const inputs = deriveResumptionComponentInputs(
		component.inputs!,
		existing ? children : createServerSlot(slot.id, {}, children),
		serverSlotPayload(slot, context)
	);
	const constructionView = inputs.constructionProps,
		publicationView = inputs.publicationProps;
	return {
		component: {
			...component,
			children: [],
			props: constructionView,
			inputs
		},
		props: publicationView as Record<string, unknown>
	};
}
