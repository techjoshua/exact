import { type AnyComponentInstance, decodeExactMarkerPart, type VNode } from '@exactjs/core';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import type { EffectScope } from '@exactjs/reactive';

import { describeVNodeType } from '../../debug.js';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { mount } from '../mounting/root.js';

/** Releases a failed adoption candidate before returning its sentinel. */
export function stopFailedAdoption(scope: EffectScope): undefined {
	scope.stop();
	return undefined;
}

/**
 * Validates the optional component name embedded by current SSR markers.
 *
 * Legacy and compiler-authored markers without the numeric/name pair remain adoptable. Named
 * markers fail closed when the client component identity differs, allowing the owning range to
 * recover without replacing adjacent DOM.
 */
export function componentMarkerMatchesType(marker: Comment, type: VNode['type']): boolean {
	const parts = marker.data.split(':');
	if (parts.length < 4 || parts[0] !== 'exact' || parts[1] !== 'component') return true;
	return (
		decodeExactMarkerPart(parts[3]!) ===
		(typeof type === 'function' ? exactComponentIdentity(type) : describeVNodeType(type))
	);
}

/** Locates a complete component marker pair and compares its optional named identity. */
export function componentMarkerBoundary(
	nodes: readonly Node[],
	cursor: number,
	type: VNode['type'],
	end = nodes.length
): { start: Comment; endIndex: number; matches: boolean } | undefined {
	const start = nodes[cursor];
	if (!(start instanceof Comment) || !start.data.startsWith('exact:component:')) return undefined;
	let endIndex = -1;
	for (let index = cursor + 1; index < end; index++) {
		const node = nodes[index];
		if (node instanceof Comment && node.data === `/${start.data}`) {
			endIndex = index;
			break;
		}
	}
	if (endIndex < 0) return undefined;
	return { start, endIndex, matches: componentMarkerMatchesType(start, type) };
}

/** Replaces only one stale component marker range while retaining sibling adoption identity. */
export function recoverMismatchedComponentRange(
	root: Root,
	vnode: VNode,
	nodes: readonly Node[],
	cursor: number,
	endIndex: number,
	parentInstance: AnyComponentInstance,
	parentScope: EffectScope,
	scope: EffectScope
): { mounted: Mounted; next: number } | undefined {
	const start = nodes[cursor];
	const parent = start?.parentNode;
	if (!start || !parent) return stopFailedAdoption(scope);
	scope.stop();
	const replacement = mount(root, vnode, parentInstance, parentScope, parent, false);
	placeMountedBefore(root, parent, replacement, start);
	for (let index = cursor; index <= endIndex; index++) {
		const stale = nodes[index]!;
		if (stale.parentNode === parent) parent.removeChild(stale);
	}
	return { mounted: replacement, next: endIndex + 1 };
}
