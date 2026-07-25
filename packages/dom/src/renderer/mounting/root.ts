import {
	Activity,
	createComponentInstance,
	createErrorReport,
	Dynamic,
	Fragment,
	getCellVNode,
	handleComponentError,
	isCellVNode,
	normalizeActivityMode,
	normalizeRenderResult,
	Portal,
	reparentComponentInstance,
	renderInstance,
	ServerSlot,
	Suspense,
	Text,
	UnsafeHtml,
	unwrap,
	watch,
	type Child,
	type ComponentFunction,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import {
	createEffectScope,
	transferEffectScope,
	withEffectScope,
	type EffectScope
} from '@exactjs/reactive';
import {
	getComponentProps,
	getListBinding,
	materializeList,
	stopRemovedListChildren,
	stopReplacedChildren
} from '../../children.js';
import { describeVNodeType } from '../../debug.js';
import { setElementOwner, setNodeOwner } from '../../ownership.js';
import { afterMountedChildren } from '../../placement.js';
import { updateProps } from '../../props.js';
import { mountServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork, isDomRenderLimitError, withTreeDepth } from '../limits.js';
import { bindText, patchChildren, rerenderComponent } from '../patching/children.js';
import { ownMountedInstance } from '../root-lifecycle.js';
import { installActivity, prepareActivity } from '../activity.js';
import { initializeSuspense } from '../suspense.js';
import { createElement, createMarker } from '../root-support.js';
import { assertUnsafeHtmlAllowed, bindUnsafeHtml } from '../unsafe-html.js';
import {
	mountChildren,
	mountDetachedChildren,
	portalEventContainer,
	portalTarget,
	withEventContainer
} from './children.js';

/** Performs the mount domain operation. */
export function mount(
	root: Root,
	vnode: VNode,
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope,
	parentNode?: Node,
	countWork = true
): Mounted {
	return withTreeDepth(root, () => {
		if (countWork) countDomWork(root);
		const parked = takeParkedMount(root, vnode, parentInstance, parentScope);
		if (parked) return parked;
		const scope = createEffectScope(parentScope);
		try {
			const mounted = mountInner(root, vnode, scope, parentInstance, parentNode);
			const owner = mounted.instance ?? parentInstance;
			if (owner) {
				setNodeOwner(mounted.dom, owner);
				if (mounted.end) setNodeOwner(mounted.end, owner);
			}
			return mounted;
		} catch (error) {
			scope.stop();
			throw error;
		}
	});
}

function takeParkedMount(
	root: Root,
	vnode: VNode,
	parentInstance?: ComponentInstance<any>,
	parentScope?: EffectScope
): Mounted | undefined {
	const candidates = root.replacementParking?.mounts.get(vnode);
	const parked = candidates?.shift();
	if (!parked) return undefined;
	if (!candidates?.length) root.replacementParking?.mounts.delete(vnode);
	root.replacementParking?.commits.push(() => {
		transferEffectScope(parked.mounted.scope, parentScope);
		parked.mounted.vnode = vnode;
		if (parked.mounted.instance) {
			reparentComponentInstance(parked.mounted.instance, parentInstance);
			parked.mounted.instance.updateProps(getComponentProps(vnode));
		}
	});
	return parked.mounted;
}

/** Performs the mount inner domain operation. */
export function mountInner(
	root: Root,
	vnode: VNode,
	scope: EffectScope,
	parentInstance?: ComponentInstance<any>,
	parentNode?: Node
): Mounted {
	if (isCellVNode(vnode)) {
		const marker = createMarker(root, 'cell');
		const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
		mounted.children = mountDetachedChildren(
			root,
			[getCellVNode(vnode)],
			parentInstance,
			mounted.scope,
			parentNode
		);
		return mounted;
	}

	if (vnode.type === Text) {
		const node = document.createTextNode('');
		const mounted: Mounted = { vnode, dom: node, scope, children: [] };
		bindText(mounted, vnode.props.value);
		return mounted;
	}

	if (vnode.type === UnsafeHtml) {
		assertUnsafeHtmlAllowed(root);
		const id = `exact:unsafe-html:client`;
		const start = document.createComment(id);
		const end = document.createComment(`/${id}`);
		const mounted: Mounted = { vnode, dom: start, end, scope, children: [], rawNodes: [] };
		bindUnsafeHtml(root, mounted, vnode.props.value);
		return mounted;
	}

	if (vnode.type === Activity) {
		const start = createMarker(root, 'activity');
		const end = createMarker(root, 'activity-end');
		const contentScope = createEffectScope(scope);
		const mounted: Mounted = {
			vnode,
			dom: start,
			end,
			scope,
			children: []
		};
		const mode = normalizeActivityMode(unwrap(vnode.props.mode));
		const activityOwner = prepareActivity(root, mounted, parentInstance, contentScope, mode);
		mounted.children = mountDetachedChildren(
			root,
			vnode.children,
			activityOwner,
			contentScope,
			parentNode
		);
		installActivity(root, mounted);
		return mounted;
	}

	if (vnode.type === Suspense) {
		const mounted: Mounted = {
			vnode,
			dom: createMarker(root, 'suspense'),
			end: createMarker(root, 'suspense-end'),
			scope,
			children: []
		};
		initializeSuspense(root, mounted, parentInstance, parentNode);
		return mounted;
	}

	if (vnode.type === Fragment) {
		const marker = createMarker(root, 'fragment');
		const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
		const list = getListBinding(vnode);
		mounted.children = list
			? mountDetachedChildren(
					root,
					materializeList(list),
					parentInstance,
					mounted.scope,
					parentNode
				)
			: mountDetachedChildren(root, vnode.children, parentInstance, mounted.scope, parentNode);
		if (list) {
			mounted.stop = watch(
				() => {
					const nextChildren = materializeList(list);
					const parent = marker.parentNode;
					if (!parent) return;
					mounted.children = patchChildren(
						root,
						parent,
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
					onSchedule: () => stopRemovedListChildren(mounted, list)
				}
			);
		}
		return mounted;
	}

	if (vnode.type === Dynamic) {
		const marker = createMarker(root, 'dynamic');
		const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
		const value = vnode.props.value;
		mounted.children = mountDetachedChildren(
			root,
			normalizeRenderResult(unwrap(value) as Child | Child[]),
			parentInstance,
			mounted.scope,
			parentNode
		);
		mounted.stop = watch(
			() => {
				const nextChildren = normalizeRenderResult(unwrap(value) as Child | Child[]);
				const parent = marker.parentNode;
				if (!parent) return;
				mounted.children = patchChildren(
					root,
					parent,
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

	if (vnode.type === Portal) {
		const marker = createMarker(root, 'portal');
		const target = portalTarget(vnode);
		const mounted: Mounted = { vnode, dom: marker, scope, children: [], portalTarget: target };
		const eventContainer = portalEventContainer(root, target);
		if (eventContainer === target) root.portalTargets.add(target);
		mounted.children = withEventContainer(root, eventContainer, () =>
			mountChildren(root, target, vnode.children, parentInstance, mounted.scope)
		);
		return mounted;
	}

	if (vnode.type === ServerSlot) {
		return mountServerSlot(root, vnode, scope);
	}

	if (typeof vnode.type === 'function') {
		const wrapper = createMarker(root, 'component');
		const mounted: Mounted = { vnode, dom: wrapper, scope, children: [] };
		let constructing = true;
		let invalidatedDuringConstruction = false;
		const invalidate = () => {
			if (constructing) {
				invalidatedDuringConstruction = true;
				return;
			}
			rerenderComponent(root, mounted);
		};
		try {
			const instance = withEffectScope(mounted.scope, () =>
				createComponentInstance(
					vnode.type as ComponentFunction<any, Record<string, unknown>>,
					getComponentProps(vnode),
					parentInstance,
					undefined,
					vnode.domain ?? parentInstance?.domain
				)
			);
			ownMountedInstance(mounted, instance);
			const rendered = withEffectScope(mounted.scope, () => renderInstance(instance, invalidate));
			mounted.children = mountDetachedChildren(root, rendered, instance, mounted.scope, parentNode);
			instance.markMounted();
		} catch (error) {
			if (isDomRenderLimitError(error)) throw error;
			const fallback = handleComponentError(
				parentInstance,
				createErrorReport(error, 'construct', parentInstance, describeVNodeType(vnode.type))
			);
			mounted.children = fallback
				? mountDetachedChildren(
						root,
						normalizeRenderResult(fallback()),
						parentInstance,
						mounted.scope,
						parentNode
					)
				: [];
		}
		constructing = false;
		if (invalidatedDuringConstruction)
			mounted.afterPlacement = () => {
				if (mounted.scope.active) rerenderComponent(root, mounted);
			};
		return mounted;
	}

	const element = createElement(vnode.type as string, parentNode, vnode.props);
	const mounted: Mounted = { vnode, dom: element, scope, children: [] };
	if (parentInstance) setElementOwner(element, parentInstance);
	mounted.children = mountChildren(root, element, vnode.children, parentInstance, mounted.scope);
	updateProps(root, element, {}, vnode.props, mounted.scope);
	return mounted;
}
