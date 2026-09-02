import { type AnyComponentInstance, type Child } from '@exactjs/core';
import {
	createEffectScope,
	transferEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import { readRenderProgramReceipt } from '@exactjs/core/runtime/render-operations';
import {
	readChildRangeReceipt,
	readCompiledActivityReceipt,
	readCompiledComponentReceipt,
	readCompiledFragmentReceipt,
	readCompiledIntrinsicReceipt,
	readCompiledKeyedChildReceipt,
	readCompiledSuspenseReceipt,
	readCompiledTargetReceipt,
	readServerSlotReceipt,
	readUnsafeHtmlReceipt
} from '@exactjs/core/runtime/component-operations';
import type { Mounted, Root } from '../../types.js';
import { unmountMany } from '../teardown.js';
import { adoptComponentReceipt } from './component-receipt.js';
import {
	adoptChildRangeReceipt,
	adoptIntrinsicReceipt,
	adoptStructuralRangeReceipt
} from './native-receipt.js';
import { requireStructuralBoundaryCapability } from '../structural-capability.js';
import { requireUnsafeHtmlDomCapability } from '../unsafe-html-capability.js';
import { adoptServerSlotReceipt } from '../../server-slots.js';
import { scalarText } from '../scalar-child.js';
import { adoptCompiledRenderProgram } from '../render-program.js';
import { countDomWork, withTreeDepth } from '../limits.js';

/** Performs the boundary markers domain operation. */
export function boundaryMarkers(container: Element): { start: Comment; end: Comment } | undefined {
	const comments = Array.from(container.childNodes).filter(
		(node): node is Comment => node.nodeType === Node.COMMENT_NODE
	);
	const start = comments.find((node) => node.data.startsWith('exact:'));
	if (!start) return undefined;
	const end = comments.find((node) => node.data === `/${start.data}`);
	return end ? { start, end } : undefined;
}

/** Performs the content nodes between domain operation. */
export function contentNodesBetween(start: Node, end: Node): Node[] {
	const nodes: Node[] = [];
	for (let current = start.nextSibling; current && current !== end; current = current.nextSibling)
		nodes.push(current);
	return nodes;
}

/** Creates a range anchor. */
export function createRangeAnchor(parent: Node): Node {
	return parent.nodeType === Node.DOCUMENT_NODE
		? document.createComment('exact:component-range')
		: document.createTextNode('');
}

/** Defines the framework child range type contract. */
export type FrameworkChildRange = { start: Comment; end: Comment };

/** Performs the framework child range domain operation. */
export function frameworkChildRange(parent: Element): FrameworkChildRange | undefined {
	const children = Array.from(parent.childNodes);
	const startIndex = children.findIndex(
		(node) => node instanceof Comment && node.data === 'exact:framework-body:start'
	);
	if (startIndex < 0) return undefined;
	const endIndex = children.findIndex(
		(node, index) =>
			index > startIndex && node instanceof Comment && node.data === 'exact:framework-body:end'
	);
	if (endIndex < 0) return undefined;
	return {
		start: children[startIndex] as Comment,
		end: children[endIndex] as Comment
	};
}

/** Performs the authored child nodes domain operation. */
export function authoredChildNodes(
	parent: Element,
	framework: FrameworkChildRange | undefined
): Node[] {
	if (!framework) return Array.from(parent.childNodes);
	const nodes: Node[] = [];
	let frameworkOwned = false;
	for (const node of Array.from(parent.childNodes)) {
		if (node === framework.start) {
			frameworkOwned = true;
			continue;
		}
		if (node === framework.end) {
			frameworkOwned = false;
			continue;
		}
		if (!frameworkOwned) nodes.push(node);
	}
	return nodes;
}

/** Performs the adopt static children domain operation. */
export function adoptStaticChildren(
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	start = 0,
	end = nodes.length
): Mounted[] | undefined {
	return adoptStaticChildrenRange(
		root,
		children,
		nodes,
		parentInstance,
		parentScope,
		true,
		start,
		end
	)?.mounts;
}

/**
 * Adopts component-owned children while retiring an enclosing server-executor transport range.
 * The target-local wrapper is not part of the client component's child topology.
 */
export function adoptComponentChildren(
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	start = 0,
	end = nodes.length
): Mounted[] | undefined {
	const direct = adoptStaticChildren(
		root,
		children,
		nodes,
		parentInstance,
		parentScope,
		start,
		end
	);
	if (direct) return direct;
	const opening = nodes[start];
	if (!(opening instanceof Comment) || !opening.data.startsWith('exact:dynamic:')) return undefined;
	const closingIndex = closingMarkerIndex(nodes, start, opening.data, end);
	if (closingIndex !== end - 1) return undefined;
	const adopted = adoptStaticChildren(
		root,
		children,
		nodes,
		parentInstance,
		parentScope,
		start + 1,
		closingIndex
	);
	if (!adopted) return undefined;
	opening.remove();
	const closing = nodes[closingIndex];
	closing?.parentNode?.removeChild(closing);
	return adopted;
}

/** Performs the adopt static children range domain operation. */
export function adoptStaticChildrenRange(
	root: Root,
	children: Child[],
	nodes: readonly Node[],
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope,
	requireAll: boolean,
	start = 0,
	end = nodes.length
): { mounts: Mounted[]; next: number } | undefined {
	const mounts: Mounted[] = [];
	let cursor = start;
	for (const child of children) {
		if (child === null || child === undefined || child === false || child === true) continue;
		const keyedReceipt = readCompiledKeyedChildReceipt(child);
		if (keyedReceipt) {
			const opening = nodes[cursor];
			if (!(opening instanceof Comment) || !opening.data.startsWith('exact:item:')) {
				unmountMany(mounts);
				return undefined;
			}
			const closing = closingMarkerIndex(nodes, cursor, opening.data, end);
			if (closing < 0) {
				unmountMany(mounts);
				return undefined;
			}
			const itemScope = keyedReceipt.ownerScope ?? createEffectScope(parentScope);
			if (keyedReceipt.ownerScope) transferEffectScope(itemScope, parentScope);
			const adopted = adoptStaticChildrenRange(
				root,
				[keyedReceipt.value as Child],
				nodes,
				parentInstance,
				itemScope,
				true,
				cursor + 1,
				closing
			);
			if (!adopted || adopted.mounts.length !== 1) {
				itemScope.stop();
				unmountMany(mounts);
				return undefined;
			}
			mounts.push({
				operation: child,
				operationKey: keyedReceipt.key,
				range: 'item',
				dom: opening,
				end: nodes[closing]!,
				scope: itemScope,
				children: adopted.mounts
			});
			cursor = closing + 1;
			continue;
		}
		const componentReceipt = readCompiledComponentReceipt(child);
		const intrinsicReceipt = readCompiledIntrinsicReceipt(child);
		const fragmentReceipt = readCompiledFragmentReceipt(child);
		const targetReceipt = readCompiledTargetReceipt(child);
		const rangeReceipt = readChildRangeReceipt(child);
		const activityReceipt = readCompiledActivityReceipt(child);
		const suspenseReceipt = readCompiledSuspenseReceipt(child);
		const unsafeHtmlReceipt = readUnsafeHtmlReceipt(child);
		const serverSlotReceipt = readServerSlotReceipt(child);
		const renderProgramReceipt = readRenderProgramReceipt(child);
		const scalar = scalarText(child);
		if (scalar !== undefined) {
			const node = nodes[cursor];
			if (node?.nodeType !== Node.TEXT_NODE || node.textContent !== scalar) {
				unmountMany(mounts);
				return undefined;
			}
			const scope = createEffectScope(parentScope);
			mounts.push({ scalar: true, scalarValue: scalar, dom: node, scope, children: [] });
			cursor++;
			continue;
		}
		const result = serverSlotReceipt
			? adoptServerSlotReceipt(serverSlotReceipt, nodes, cursor, createEffectScope(parentScope))
			: componentReceipt
				? adoptComponentReceipt(
						root,
						componentReceipt,
						nodes,
						cursor,
						parentInstance,
						parentScope,
						end,
						false
					)
				: intrinsicReceipt
					? adoptIntrinsicReceipt(
							root,
							intrinsicReceipt,
							nodes,
							cursor,
							parentInstance,
							parentScope,
							adoptStaticChildren
						)
					: fragmentReceipt || targetReceipt
						? adoptStructuralRangeReceipt(
								root,
								(fragmentReceipt ?? targetReceipt)!,
								fragmentReceipt ? 'fragment' : 'target',
								nodes,
								cursor,
								parentInstance,
								parentScope,
								end,
								adoptStaticChildren
							)
						: rangeReceipt
							? adoptChildRangeReceipt(
									root,
									rangeReceipt,
									nodes,
									cursor,
									parentInstance,
									parentScope,
									end,
									adoptStaticChildren
								)
							: activityReceipt
								? requireStructuralBoundaryCapability().adoptActivityReceipt(
										root,
										activityReceipt,
										nodes,
										cursor,
										parentInstance,
										parentScope,
										end,
										adoptStaticChildren
									)
								: unsafeHtmlReceipt
									? requireUnsafeHtmlDomCapability().adopt(
											root,
											unsafeHtmlReceipt,
											nodes,
											cursor,
											parentScope,
											end
										)
									: suspenseReceipt
										? requireStructuralBoundaryCapability().adoptSuspenseReceipt(
												root,
												suspenseReceipt,
												nodes,
												cursor,
												parentInstance,
												parentScope,
												end,
												adoptStaticChildren
											)
										: renderProgramReceipt
											? withTreeDepth(root, () => {
													countDomWork(root);
													return adoptCompiledRenderProgram(
														root,
														child,
														nodes,
														cursor,
														parentInstance,
														createEffectScope(parentScope),
														end,
														(values, childNodes, owner, scope, childCursor, childEnd) =>
															adoptStaticChildren(
																root,
																[...values],
																childNodes,
																owner,
																scope,
																childCursor,
																childEnd
															)
													);
												})
											: undefined;
		if (!result) {
			unmountMany(mounts);
			return undefined;
		}
		// Keep the opaque compiler-issued operation as the authored identity. Receipt data is
		// renderer-private and intentionally cannot be reinterpreted to recover enhancements,
		// keys, or later patch identity.
		result.mounted.operation = child;
		mounts.push(result.mounted);
		cursor = result.next;
	}
	if (requireAll && cursor !== end) {
		unmountMany(mounts);
		return undefined;
	}
	return { mounts, next: cursor };
}

/** Finds the closing comment for an authored marker range after its opening cursor. */
export function closingMarkerIndex(
	nodes: readonly Node[],
	cursor: number,
	opening: string,
	end = nodes.length
): number {
	const closing = `/${opening}`;
	let nested = 0;
	for (let index = cursor + 1; index < end; index++) {
		const node = nodes[index];
		if (!(node instanceof Comment)) continue;
		if (node.data === opening) nested++;
		else if (node.data === closing) {
			if (nested === 0) return index;
			nested--;
		}
	}
	return -1;
}
