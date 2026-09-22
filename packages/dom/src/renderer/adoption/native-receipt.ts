import { encodeExactMarkerPart } from '@exactjs/core';
import { mountTextHost as mountTextHostPresentation } from '../text-host-capability.js';
import type { AnyComponentInstance, Child } from '@exactjs/core';
import { readDoctype } from '@exactjs/core/runtime/component-operations';
import type {
	ExactChildRangeReceiptData,
	ExactFragmentReceiptData,
	ExactIntrinsicReceiptData,
	ExactTargetReceiptData
} from '@exactjs/core/runtime/component-operations';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { setElementOwner } from '../../ownership.js';
import { updateProps } from '../../props.js';
import type { Mounted, Root } from '../../types.js';
import { installAdoptedChildRangeReceipt, rangeChildren } from '../child-range-receipt.js';
import { refreshTargetBoundary } from '../target-capability.js';
import { intrinsicTextChildren } from '../intrinsic-text.js';
import {
	authoredChildNodes,
	closingMarkerIndex,
	frameworkChildRange,
	isChildRangeOpening
} from './boundaries.js';

/** Adopts compiler-issued child operations within one bounded SSR-owned node range. */
export type AdoptReceiptChildren = (
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	start?: number,
	end?: number
) => Mounted[] | undefined;

/** Adopts one direct intrinsic operation against its compiler-known host. */
export function adoptIntrinsicReceipt(
	root: Root,
	receipt: ExactIntrinsicReceiptData,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	adoptChildren: AdoptReceiptChildren
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const node = nodes[cursor];
	if (!(node instanceof Element) || node.tagName.toLowerCase() !== receipt.tag.toLowerCase()) {
		scope.stop();
		return undefined;
	}
	const framework = frameworkChildRange(node);
	const textHost = receipt.tag === 'title' || receipt.tag === 'textarea';
	const existingText = node.firstChild;
	if (
		textHost &&
		(node.childNodes.length > 1 || (existingText && !(existingText instanceof Text)))
	) {
		scope.stop();
		return undefined;
	}
	const children = textHost
		? [
				mountTextHostPresentation(
					root,
					receipt.children,
					parentInstance,
					scope,
					existingText as Text | undefined
				)
			]
		: adoptChildren(
				root,
				[...intrinsicTextChildren(root, receipt.tag, receipt.children)],
				authoredChildNodes(node, framework),
				parentInstance,
				scope
			);
	if (!children) {
		scope.stop();
		return undefined;
	}
	if (textHost && !existingText) node.appendChild(children[0]!.dom);
	if (parentInstance) setElementOwner(node, parentInstance);
	updateProps(root, node, {}, receipt.props, scope, false);
	return {
		mounted: {
			intrinsicReceipt: receipt,
			dom: node,
			scope,
			children,
			...(framework ? { childEnd: framework.start } : {})
		},
		next: cursor + 1
	};
}

/** Adopts one transparent or semantic-target receipt marker range. */
export function adoptStructuralRangeReceipt(
	root: Root,
	receipt: ExactFragmentReceiptData | ExactTargetReceiptData,
	kind: 'fragment' | 'target',
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	end: number,
	adoptChildren: AdoptReceiptChildren
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const start = nodes[cursor];
	if (
		kind === 'fragment' &&
		receipt.children.some(readDoctype) &&
		start instanceof Element &&
		start.parentNode?.nodeType === Node.DOCUMENT_NODE
	) {
		const children = adoptChildren(
			root,
			[...receipt.children],
			nodes,
			parentInstance,
			scope,
			cursor,
			end
		);
		if (!children) {
			scope.stop();
			return undefined;
		}
		const opening = document.createComment('exact:document');
		const closing = document.createComment('/exact:document');
		start.parentNode.insertBefore(opening, start);
		start.parentNode.insertBefore(closing, nodes[end - 1]!.nextSibling);
		return {
			mounted: {
				fragmentReceipt: receipt as ExactFragmentReceiptData,
				dom: opening,
				end: closing,
				scope,
				children
			},
			next: end
		};
	}
	if (!(start instanceof Comment) || !start.data.startsWith(`exact:${kind}:`)) {
		scope.stop();
		return undefined;
	}
	const endIndex = closingMarkerIndex(nodes, cursor, start.data, end);
	if (endIndex < 0) {
		scope.stop();
		return undefined;
	}
	const children = adoptChildren(
		root,
		[...receipt.children],
		nodes,
		parentInstance,
		scope,
		cursor + 1,
		endIndex
	);
	if (!children) {
		scope.stop();
		return undefined;
	}
	const mounted: Mounted = {
		...(kind === 'fragment'
			? { fragmentReceipt: receipt as ExactFragmentReceiptData }
			: { targetReceipt: receipt as ExactTargetReceiptData, targetBoundary: {} }),
		dom: start,
		end: nodes[endIndex]!,
		scope,
		children
	};
	if (kind === 'target') refreshTargetBoundary(root, mounted, parentInstance);
	return { mounted, next: endIndex + 1 };
}

/** Adopts one focused dynamic range and installs its retained reader. */
export function adoptChildRangeReceipt(
	root: Root,
	receipt: ExactChildRangeReceiptData,
	nodes: readonly Node[],
	cursor: number,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	end: number,
	adoptChildren: AdoptReceiptChildren
): { mounted: Mounted; next: number } | undefined {
	const scope = createEffectScope(parentScope);
	const start = nodes[cursor];
	// Native list receipts retain their compiler identity in the server fragment boundary.
	const listBoundary =
		start instanceof Comment &&
		receipt.markerId !== undefined &&
		start.data.startsWith('exact:fragment:') &&
		start.data.endsWith(`:${encodeExactMarkerPart(receipt.markerId)}`);
	if (!(start instanceof Comment) || (!isChildRangeOpening(start.data) && !listBoundary)) {
		scope.stop();
		return undefined;
	}
	const endIndex = closingMarkerIndex(nodes, cursor, start.data, end);
	if (endIndex < 0) {
		scope.stop();
		return undefined;
	}
	const initial = receipt.dynamicComponent ? [] : rangeChildren(receipt, parentInstance);
	const children = adoptChildren(root, initial, nodes, parentInstance, scope, cursor + 1, endIndex);
	if (!children) {
		scope.stop();
		return undefined;
	}
	const mounted: Mounted = {
		childRangeReceipt: receipt,
		dom: start,
		end: nodes[endIndex]!,
		scope,
		children,
		dynamicChildren: initial
	};
	installAdoptedChildRangeReceipt(root, mounted, receipt, parentInstance);
	return { mounted, next: endIndex + 1 };
}
