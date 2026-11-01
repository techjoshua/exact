import { captureAdoptionCurrent } from './receiving-lifetime.js';
import { attachSuppressedCleanupFailure, type RefBinding } from '@exactjs/core';
import {
	capturePreparedEnhancementBindings,
	withCapturedEnhancementBindings,
	type PreparedEnhancementBindings
} from '../prepared-output-bindings.js';
import { withDomWork } from '../limits.js';
import { retainNamespaceProps, clearNamespaceEncoding } from '../../namespace.js';
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
import { createEffectScope, unwrap, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { setElementOwner } from '../../ownership.js';
import { updateProps } from '../../props.js';
import type { Mounted, Root } from '../../types.js';
import { installAdoptedChildRangeReceipt, rangeChildren } from '../child-range-receipt.js';
import { refreshTargetBoundary } from '../target-capability.js';
import { intrinsicChildContainer } from '../intrinsic-child-container.js';
import { intrinsicTextChildren } from '../intrinsic-text.js';
import {
	adoptStaticChildren,
	collectAuthoredChildren,
	closingMarkerIndex,
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
	end?: number,
	physicalParent?: Node
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
	const assertCurrent = captureAdoptionCurrent(root, scope);
	const node = nodes[cursor];
	if (!(node instanceof Element) || node.tagName.toLowerCase() !== receipt.tag.toLowerCase()) {
		scope.stop();
		return undefined;
	}
	retainNamespaceProps(node, receipt.props);
	const textHost = receipt.tag === 'title' || receipt.tag === 'textarea';
	const textChildren = textHost
		? receipt.children
		: intrinsicTextChildren(root, receipt.tag, receipt.children);
	// The HTML parser omits empty raw-text nodes. Recreate only that missing anchor;
	// script/style use ordinary scalar bindings, without the title/textarea capability.
	if (
		(receipt.tag === 'style' || receipt.tag === 'script') &&
		!node.firstChild &&
		textChildren.length === 1 &&
		unwrap(textChildren[0]) === ''
	)
		node.appendChild(document.createTextNode(''));
	const existingText = node.firstChild;
	if (
		textHost &&
		(node.childNodes.length > 1 || (existingText && !(existingText instanceof Text)))
	) {
		scope.stop();
		return undefined;
	}
	const childContainer = intrinsicChildContainer(node);
	const { framework, nodes: authoredNodes } = collectAuthoredChildren(childContainer);
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
				[...textChildren],
				authoredNodes,
				parentInstance,
				scope,
				undefined,
				undefined,
				childContainer
			);
	if (!children) {
		clearNamespaceEncoding(node);
		scope.stop();
		return undefined;
	}
	if (textHost && !existingText) node.appendChild(children[0]!.dom);
	if (parentInstance) setElementOwner(node, parentInstance);
	try {
		updateProps(root, node, {}, receipt.props, scope, false);
		assertCurrent();
	} catch (error) {
		// This intrinsic has not transferred into the published child view yet.
		try {
			scope.stop();
		} catch (cleanup) {
			attachSuppressedCleanupFailure(error, cleanup);
		}
		try {
			(receipt.props.ref as RefBinding<unknown> | undefined)?.fulfill(undefined);
		} catch (cleanup) {
			attachSuppressedCleanupFailure(error, cleanup);
		}
		throw error;
	}
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
	const mounted: Mounted = {
		...(kind === 'fragment'
			? { fragmentReceipt: receipt as ExactFragmentReceiptData }
			: { targetReceipt: receipt as ExactTargetReceiptData, targetBoundary: {} }),
		dom: start,
		end: nodes[endIndex]!,
		scope,
		children: []
	};
	const plan = root.suppliedPlacementPlan;
	if (kind === 'target' && plan?.pending && plan.isCurrent()) {
		plan.adoptTarget({
			bindings: capturePreparedEnhancementBindings(root),
			mounted,
			receipt: receipt as ExactTargetReceiptData,
			nodes,
			start: cursor + 1,
			end: endIndex,
			parentInstance
		});
		plan.own(mounted);
	} else {
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
		mounted.children = children;
		if (kind === 'target') refreshTargetBoundary(root, mounted, parentInstance);
	}

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

/** Concrete target adoption retained by its existing reconciliation frame until placement validation. */
export type PendingTargetAdoption = Readonly<{
	bindings: PreparedEnhancementBindings | undefined;
	mounted: Mounted;
	receipt: ExactTargetReceiptData;
	nodes: readonly Node[];
	start: number;
	end: number;
	parentInstance: AnyComponentInstance | undefined;
}>;

/** Adopts the validated supplied boundary into the same occurrence, without constructing a second owner. */
export function commitTargetAdoption(root: Root, entry: PendingTargetAdoption): void {
	if (!entry.mounted.scope.active) return;
	const assertCurrent = captureAdoptionCurrent(root, entry.mounted.scope);
	const children = withCapturedEnhancementBindings(root, entry.bindings, () =>
		withDomWork(root, () =>
			adoptStaticChildren(
				root,
				[...entry.receipt.children],
				entry.nodes,
				entry.parentInstance,
				entry.mounted.scope,
				entry.start,
				entry.end
			)
		)
	);
	assertCurrent();
	if (!children) throw new Error('Supplied target did not match the hydrated DOM');
	entry.mounted.children = children;
	refreshTargetBoundary(root, entry.mounted, entry.parentInstance);
}
