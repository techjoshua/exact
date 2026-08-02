import {
	Activity,
	Dynamic,
	Fragment,
	isCellVNode,
	normalizeDocumentVNode,
	normalizeRenderResult,
	Portal,
	ServerSlot,
	Suspense,
	Text,
	UnsafeHtml,
	unwrap,
	watch,
	type Child,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { type EffectScope } from '@exactjs/reactive';
import { getOwnedCellVNode } from '../../cells.js';
import {
	getComponentProps,
	getListBinding,
	materializeList,
	stopRemovedListChildren,
	stopReplacedChildren
} from '../../children.js';
import { describeNode, describeVNodeType, domDebug } from '../../debug.js';
import { afterMountedChildren, placeMountedBefore } from '../../placement.js';
import { updateProps } from '../../props.js';
import { mountServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork, withTreeDepth } from '../limits.js';
import {
	mountChildren,
	portalEventContainer,
	portalTarget,
	withEventContainer
} from '../mounting/children.js';
import { mount } from '../mounting/root.js';
import { disposeMounted } from '../teardown.js';
import { assertUnsafeHtmlAllowed, bindUnsafeHtml } from '../unsafe-html.js';
import { installActivity } from '../activity.js';
import { updateSuspense } from '../suspense.js';
import { bindText, patchChildren } from './children.js';
import { releaseMountedRange, takeReversedRelease } from '../retained-release.js';
import { patchEnhancementBoundary } from '../enhancements.js';

/** Performs the patch domain operation. */
export function patch(
	root: Root,
	parent: Node,
	mounted: Mounted | undefined,
	next: VNode,
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope
): Mounted {
	return withTreeDepth(root, () => {
		countDomWork(root);
		return patchInner(root, parent, mounted, next, parentInstance, parentScope);
	});
}

/** Performs the patch inner domain operation. */
export function patchInner(
	root: Root,
	parent: Node,
	mounted: Mounted | undefined,
	next: VNode,
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope
): Mounted {
	if (
		root.mode === 'document' &&
		typeof next.type === 'string' &&
		next.type.toLowerCase() === 'html'
	) {
		next = normalizeDocumentVNode(next);
	}
	if (!mounted) {
		const reversed = takeReversedRelease(root, parent, next);
		if (reversed) return patchInner(root, parent, reversed, next, parentInstance, parentScope);
		const created = mount(root, next, parentInstance, parentScope, parent, false);
		placeMountedBefore(root, parent, created, null);
		return created;
	}
	if (
		mounted.enhancement &&
		mounted.vnode.type === next.type &&
		mounted.vnode.key === next.key &&
		mounted.vnode.domain === next.domain
	) {
		return patchEnhancementBoundary(
			root,
			mounted,
			next,
			parent,
			parentInstance,
			parentScope,
			(current, vnode, instance, scope) => patch(root, parent, current, vnode, instance, scope)
		);
	}

	// Pre-patch ownership hooks may stop a subtree before DOM mutation (for
	// example to release pointer capture). A stopped wrapper must be replaced as
	// a unit; recursing through it would attempt to parent new scopes beneath an
	// inactive scope.
	if (!mounted.scope.active) {
		const replacement = mount(root, next, parentInstance, parentScope, parent, false);
		placeMountedBefore(root, parent, replacement, mounted.dom);
		if (!releaseMountedRange(root, parent, mounted, 'reconcile-replaced'))
			disposeMounted(parent, mounted);
		return replacement;
	}

	if (
		mounted.vnode.type !== next.type ||
		mounted.vnode.key !== next.key ||
		mounted.vnode.domain !== next.domain
	) {
		domDebug(root, 'replace node', {
			previousType: describeVNodeType(mounted.vnode.type),
			previousKey: mounted.vnode.key ?? 'none',
			nextType: describeVNodeType(next.type),
			nextKey: next.key ?? 'none',
			parent: describeNode(parent)
		});
		const previousParking = root.replacementParking;
		const parking = {
			mounts: new Map<VNode, Array<{ mounted: Mounted; parent: Node }>>(),
			commits: [] as Array<() => void>
		};
		const ownerSnapshots = new Map<Mounted, Mounted[]>();
		const replacedDomain = mounted.instance?.domain ?? mounted.vnode.domain;
		if (replacedDomain)
			parkForeignMounts(mounted, replacedDomain, parking.mounts, ownerSnapshots, parent);
		root.replacementParking = parking;
		let replacement: Mounted;
		try {
			replacement = mount(root, next, parentInstance, parentScope, parent, false);
		} catch (error) {
			for (const [owner, children] of ownerSnapshots) owner.children = children;
			throw error;
		} finally {
			root.replacementParking = previousParking;
		}
		for (const commit of parking.commits) commit();
		placeMountedBefore(root, parent, replacement, mounted.dom);
		for (const entries of parking.mounts.values()) {
			for (const entry of entries) disposeMounted(entry.parent, entry.mounted);
		}
		if (!releaseMountedRange(root, parent, mounted, 'reconcile-replaced'))
			disposeMounted(parent, mounted);
		return replacement;
	}

	// SSR keyed item markers wrap an otherwise ordinary vnode. Keep the marker
	// range as the identity/move unit while delegating the actual patch to its
	// adopted child.
	if (mounted.range === 'item') {
		mounted.vnode = next;
		const child = mounted.children[0];
		if (child) {
			mounted.children = [patch(root, parent, child, next, parentInstance, mounted.scope)];
		} else {
			const created = mount(root, next, parentInstance, mounted.scope, parent, false);
			mounted.children = [created];
			placeMountedBefore(root, parent, created, mounted.end);
		}
		return mounted;
	}

	if (isCellVNode(next)) {
		mounted.vnode = next;
		const nextChild = getOwnedCellVNode(next);
		const previousChild = mounted.children[0];
		if (previousChild) {
			mounted.children = [
				patch(root, parent, previousChild, nextChild, parentInstance, mounted.scope)
			];
		} else {
			const child = mount(root, nextChild, parentInstance, mounted.scope, parent, false);
			mounted.children = [child];
			placeMountedBefore(root, parent, child, mounted.dom.nextSibling);
		}
		return mounted;
	}

	if (next.type === Text) {
		mounted.vnode = next;
		bindText(mounted, next.props.value);
		return mounted;
	}

	if (next.type === UnsafeHtml) {
		mounted.vnode = next;
		assertUnsafeHtmlAllowed(root);
		bindUnsafeHtml(root, mounted, next.props.value);
		return mounted;
	}

	if (next.type === Activity) {
		const activity = mounted.activity;
		if (!activity) throw new Error('Cannot patch an Activity boundary without Activity state');
		mounted.stop?.();
		mounted.stop = undefined;
		mounted.vnode = next;
		const contentParent = activity.retained?.segments[0]?.fragment ?? parent;
		mounted.children = patchChildren(
			root,
			contentParent,
			mounted.children,
			next.children,
			activity.owner,
			activity.contentScope,
			activity.retained?.detached ? null : mounted.end
		);
		installActivity(root, mounted);
		return mounted;
	}

	if (next.type === Suspense) {
		updateSuspense(root, parent, mounted, next, parentInstance);
		return mounted;
	}

	if (next.type === Fragment) {
		const previousList = getListBinding(mounted.vnode);
		const nextList = getListBinding(next);
		mounted.vnode = next;
		if (previousList !== nextList) {
			mounted.stop?.();
			mounted.stop = undefined;
			mounted.children = patchChildren(
				root,
				parent,
				mounted.children,
				nextList ? materializeList(nextList) : next.children,
				parentInstance,
				mounted.scope,
				afterMountedChildren(mounted)
			);
			if (nextList) {
				mounted.stop = watch(
					() => {
						mounted.children = patchChildren(
							root,
							mounted.dom.parentNode ?? parent,
							mounted.children,
							materializeList(nextList),
							parentInstance,
							mounted.scope,
							afterMountedChildren(mounted)
						);
					},
					undefined,
					{
						scope: mounted.scope,
						onSchedule: () => stopRemovedListChildren(mounted, nextList)
					}
				);
			}
		} else if (!nextList) {
			mounted.children = patchChildren(
				root,
				parent,
				mounted.children,
				next.children,
				parentInstance,
				mounted.scope,
				afterMountedChildren(mounted)
			);
		}
		return mounted;
	}

	if (next.type === Dynamic) {
		mounted.vnode = next;
		const value = next.props.value;
		mounted.stop?.();
		mounted.children = patchChildren(
			root,
			parent,
			mounted.children,
			normalizeRenderResult(unwrap(value) as Child | Child[]),
			parentInstance,
			mounted.scope,
			afterMountedChildren(mounted)
		);
		mounted.stop = watch(
			() => {
				const nextChildren = normalizeRenderResult(unwrap(value) as Child | Child[]);
				mounted.children = patchChildren(
					root,
					mounted.dom.parentNode ?? parent,
					mounted.children,
					nextChildren,
					parentInstance,
					mounted.scope,
					afterMountedChildren(mounted)
				);
			},
			undefined,
			{
				scope: mounted.scope,
				onSchedule: () =>
					stopReplacedChildren(mounted, normalizeRenderResult(unwrap(value) as Child | Child[]))
			}
		);
		return mounted;
	}

	if (next.type === Portal) {
		const previousTarget = mounted.portalTarget ?? portalTarget(mounted.vnode);
		const nextTarget = portalTarget(next);
		mounted.vnode = next;
		if (previousTarget !== nextTarget) {
			mounted.children = patchChildren(
				root,
				previousTarget,
				mounted.children,
				[],
				parentInstance,
				mounted.scope
			);
			mounted.portalTarget = nextTarget;
			const eventContainer = portalEventContainer(root, nextTarget);
			if (eventContainer === nextTarget) root.portalTargets.add(nextTarget);
			mounted.children = withEventContainer(root, eventContainer, () =>
				mountChildren(root, nextTarget, next.children, parentInstance, mounted.scope)
			);
		} else {
			mounted.children = withEventContainer(root, portalEventContainer(root, nextTarget), () =>
				patchChildren(
					root,
					nextTarget,
					mounted.children,
					next.children,
					parentInstance,
					mounted.scope
				)
			);
		}
		return mounted;
	}

	if (next.type === ServerSlot) {
		mounted.vnode = next;
		if (
			mounted.dom instanceof Element &&
			mounted.dom.getAttribute('data-exact-server-slot') === String(next.props.id ?? '')
		) {
			return mounted;
		}
		const replacement = mountServerSlot(root, next, mounted.scope);
		placeMountedBefore(root, parent, replacement, mounted.dom);
		disposeMounted(parent, mounted);
		return replacement;
	}

	if (typeof next.type === 'function') {
		mounted.vnode = next;
		mounted.instance?.updateProps(getComponentProps(next));
		return mounted;
	}

	const previousProps = mounted.vnode.props;
	mounted.vnode = next;
	mounted.children = patchChildren(
		root,
		mounted.dom,
		mounted.children,
		next.children,
		parentInstance,
		mounted.scope,
		mounted.childEnd
	);
	updateProps(root, mounted.dom as Element, previousProps, next.props, mounted.scope);
	return mounted;
}

function parkForeignMounts(
	owner: Mounted,
	replacedDomain: ComponentInstance<any>['domain'],
	parking: Map<VNode, Array<{ mounted: Mounted; parent: Node }>>,
	ownerSnapshots: Map<Mounted, Mounted[]>,
	fallbackParent: Node
): void {
	ownerSnapshots.set(owner, owner.children);
	const retained: Mounted[] = [];
	for (const child of owner.children) {
		const domain = child.instance?.domain ?? child.vnode.domain;
		if (domain && domain !== replacedDomain) {
			const candidates = parking.get(child.vnode) ?? [];
			candidates.push({ mounted: child, parent: child.dom.parentNode ?? fallbackParent });
			parking.set(child.vnode, candidates);
			continue;
		}
		parkForeignMounts(
			child,
			replacedDomain,
			parking,
			ownerSnapshots,
			child.portalTarget ?? fallbackParent
		);
		retained.push(child);
	}
	owner.children = retained;
}
