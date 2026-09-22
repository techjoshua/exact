import { mountTextHost as mountTextHostPresentation } from '../text-host-capability.js';
import { placeMountedBefore } from '../../placement.js';
import type { AnyComponentInstance } from '@exactjs/core';
import type { ExactIntrinsicReceiptData } from '@exactjs/core/runtime/component-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import { setElementOwner } from '../../ownership.js';
import { updateProps } from '../../props.js';
import type { Mounted, Root } from '../../types.js';
import { createElement } from '../root-support.js';
import { mountChildren } from './children.js';
import { intrinsicTextChildren } from '../intrinsic-text.js';

/** Executes one compiler-selected intrinsic operation directly. */
export function mountIntrinsicReceipt(
	root: Root,
	receipt: ExactIntrinsicReceiptData,
	scope: EffectScope,
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const element = createElement(receipt.tag, parentNode, receipt.props);
	const mounted: Mounted = {
		intrinsicReceipt: receipt,
		dom: element,
		scope,
		children: []
	};
	if (parentInstance) setElementOwner(element, parentInstance);
	if (receipt.tag === 'title' || receipt.tag === 'textarea') {
		const text = mountTextHostPresentation(root, receipt.children, parentInstance, scope);
		mounted.children = [text];
		placeMountedBefore(root, element, text);
	} else
		mounted.children = mountChildren(
			root,
			element,
			[...intrinsicTextChildren(root, receipt.tag, receipt.children)],
			parentInstance,
			scope
		);
	updateProps(root, element, {}, receipt.props, scope);
	return mounted;
}
