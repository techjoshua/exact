import {
	createComponentInstance,
	createErrorReport,
	Dynamic,
	Fragment,
	getCellVNode,
	handleComponentError,
	isCellVNode,
	normalizeRenderResult,
	Portal,
	renderInstance,
	ServerSlot,
	Text,
	UnsafeHtml,
	unwrap,
	watch,
	type Child,
	type ComponentFunction,
	type ComponentInstance,
	type VNode
} from '@exact/core';
import { createEffectScope, withEffectScope, type EffectScope } from '@exact/reactive';
import {
	getComponentProps,
	getListBinding,
	materializeList,
	stopRemovedListChildren,
	stopReplacedChildren
} from '../../children.js';
import { describeVNodeType } from '../../debug.js';
import { setElementOwner } from '../../ownership.js';
import { afterMountedChildren } from '../../placement.js';
import { updateProps } from '../../props.js';
import { mountServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork, isDomRenderLimitError, withTreeDepth } from '../limits.js';
import { bindText, patchChildren, rerenderComponent } from '../patching/children.js';
import { ownMountedInstance } from '../root-lifecycle.js';
import { createElement, createMarker } from '../root-support.js';
import { assertUnsafeHtmlAllowed, bindUnsafeHtml } from '../unsafe-html.js';
import {
	mountChildren,
	mountDetachedChildren,
	portalEventContainer,
	portalTarget,
	withEventContainer
} from './children.js';

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
		const scope = createEffectScope(parentScope);
		try {
			return mountInner(root, vnode, scope, parentInstance, parentNode);
		} catch (error) {
			scope.stop();
			throw error;
		}
	});
}

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
					parentInstance
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
