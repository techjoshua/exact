import {
	type AnyComponentInstance,
	type AnyEnhancementComponentFunction,
	Activity,
	createErrorReport,
	Dynamic,
	Fragment,
	handleComponentError,
	normalizeRenderResult,
	Portal,
	Suspense,
	Target,
	Text,
	UnsafeHtml,
	watch,
	type VNode
} from '@exactjs/core';
import {
	createComponentInstance,
	isCellVNode,
	RenderProgram,
	reparentComponentInstance,
	renderInstance,
	ServerSlot
} from '@exactjs/core/runtime/render';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import {
	createEffectScope,
	flushSync,
	transferEffectScope,
	withEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import { getOwnedCellVNode } from '../../cells.js';
import {
	getComponentProps,
	getListBinding,
	materializeList,
	takeMaterializedListScope
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
import { refreshComponentRoot, rootIntroduction } from '../component-roots.js';
import { refreshTargetBoundary } from '../target-capability.js';
import { createElement, createMarker } from '../root-support.js';
import { requireUnsafeHtmlDomCapability } from '../unsafe-html-capability.js';
import { requireStructuralBoundaryCapability } from '../structural-capability.js';
import { requireDomEnhancementCapability } from '../enhancement-capability.js';
import { mountRenderProgram } from '../render-program.js';
import { mountDynamic } from '../dynamic.js';
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
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	parentNode?: Node,
	countWork = true
): Mounted {
	return withTreeDepth(root, () => {
		if (countWork) countDomWork(root);
		const parked = takeParkedMount(root, vnode, parentInstance, parentScope);
		if (parked) return parked;
		const hasEnhancements = !!vnode.enhancement?.entries.length;
		const enhancementCapability = hasEnhancements ? requireDomEnhancementCapability() : undefined;
		const nesting = root.enhancementNesting ?? 0;
		if (
			hasEnhancements &&
			nesting === 0 &&
			(typeof vnode.type === 'string' || vnode.type === Fragment)
		) {
			enhancementCapability!.install(root, (next, instance, nextScope, node) =>
				mount(root, next, instance, nextScope, node, false)
			);
			const direct = enhancementCapability!.mountDirect?.(
				root,
				vnode,
				parentInstance,
				parentScope,
				(next, instance, nextScope, node) => mount(root, next, instance, nextScope, node, false)
			);
			if (direct) return direct;
		}
		const scope = takeMaterializedListScope(vnode) ?? createEffectScope(parentScope);
		if (hasEnhancements) root.enhancementNesting = nesting + 1;
		try {
			let mounted = mountInner(root, vnode, scope, parentInstance, parentNode);
			if (hasEnhancements) {
				if (nesting === 0) {
					enhancementCapability!.install(root, (next, instance, nextScope, node) =>
						mount(root, next, instance, nextScope, node, false)
					);
					mounted = enhancementCapability!.activate(
						root,
						mounted,
						parentInstance,
						parentScope,
						(next, instance, nextScope, node) => mount(root, next, instance, nextScope, node, false)
					);
				}
			}
			const owner = mounted.instance ?? parentInstance;
			if (owner) {
				setNodeOwner(mounted.dom, owner);
				if (mounted.end) setNodeOwner(mounted.end, owner);
			}
			return mounted;
		} catch (error) {
			scope.stop();
			throw error;
		} finally {
			if (hasEnhancements) root.enhancementNesting = nesting;
		}
	});
}

function takeParkedMount(
	root: Root,
	vnode: VNode,
	parentInstance?: AnyComponentInstance,
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
	parentInstance?: AnyComponentInstance,
	parentNode?: Node
): Mounted {
	if (isCellVNode(vnode)) {
		const marker = createMarker(root, 'cell');
		const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
		const child = getOwnedCellVNode(vnode);
		mounted.children = mountDetachedChildren(
			root,
			[child],
			parentInstance,
			mounted.scope,
			parentNode
		);
		return mounted;
	}

	if (vnode.type === RenderProgram) {
		const planned = mountRenderProgram(root, vnode, scope, parentInstance);
		if (planned) return planned;
		throw new Error('Compiler-closed render program could not be mounted');
	}

	if (vnode.type === Text) {
		const node = document.createTextNode('');
		const mounted: Mounted = { vnode, dom: node, scope, children: [] };
		bindText(mounted, vnode.props.value);
		return mounted;
	}

	if (vnode.type === UnsafeHtml) {
		const capability = requireUnsafeHtmlDomCapability();
		capability.assertAllowed(root);
		const id = `exact:unsafe-html:client`;
		const start = document.createComment(id);
		const end = document.createComment(`/${id}`);
		const mounted: Mounted = { vnode, dom: start, end, scope, children: [], rawNodes: [] };
		capability.bind(root, mounted, vnode.props.value);
		return mounted;
	}

	if (vnode.type === Activity) {
		return requireStructuralBoundaryCapability().mountActivity(
			root,
			vnode,
			scope,
			parentInstance,
			parentNode
		);
	}

	if (vnode.type === Suspense) {
		return requireStructuralBoundaryCapability().mountSuspense(
			root,
			vnode,
			scope,
			parentInstance,
			parentNode
		);
	}

	if (vnode.type === Target) {
		const marker = createMarker(root, 'target');
		const mounted: Mounted = {
			vnode,
			dom: marker,
			scope,
			children: mountDetachedChildren(root, vnode.children, parentInstance, scope, parentNode),
			targetBoundary: {}
		};
		refreshTargetBoundary(root, mounted, parentInstance);
		return mounted;
	}

	if (vnode.type === Fragment) {
		const marker = createMarker(root, 'fragment');
		const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
		const list = getListBinding(vnode);
		mounted.children = list
			? mountDetachedChildren(
					root,
					materializeList(list, mounted.scope),
					parentInstance,
					mounted.scope,
					parentNode
				)
			: mountDetachedChildren(root, vnode.children, parentInstance, mounted.scope, parentNode);
		if (list && vnode.props.__exactProgramList !== true) {
			mounted.stop = watch(
				() => {
					const nextChildren = materializeList(list, mounted.scope);
					const parent = marker.parentNode;
					if (!parent) return;
					mounted.children = patchChildren(
						root,
						parent,
						mounted.children,
						nextChildren,
						parentInstance,
						mounted.scope,
						afterMountedChildren(mounted),
						mounted
					);
				},
				undefined,
				{ scope: mounted.scope }
			);
		}
		return mounted;
	}

	if (vnode.type === Dynamic) return mountDynamic(root, vnode, scope, parentInstance, parentNode);

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
		// The compiler or a framework library must claim native ownership. Foreign
		// function components cross an explicit compatibility adapter instead.
		exactComponentIdentity(vnode.type);
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
					vnode.type as AnyEnhancementComponentFunction,
					getComponentProps(vnode),
					parentInstance,
					parentInstance?.ambientContexts ?? root.ambientContexts,
					vnode.domain ?? parentInstance?.domain
				)
			);
			ownMountedInstance(mounted, instance);
			// Compiler-owned setup activations may synchronously initialize state
			// consumed by the first render or a child component's required props.
			flushSync('normal');
			const rendered = withEffectScope(mounted.scope, () => renderInstance(instance, invalidate));
			mounted.children = mountDetachedChildren(root, rendered, instance, mounted.scope, parentNode);
			refreshComponentRoot(instance, true, rootIntroduction(root));
			instance.markMounted();
		} catch (error) {
			if (isDomRenderLimitError(error)) throw error;
			const fallback = handleComponentError(
				parentInstance,
				createErrorReport(error, 'construct', parentInstance, describeVNodeType(vnode.type)),
				null
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

	if (typeof vnode.type !== 'string')
		throw new TypeError(
			`Unsupported eXact vnode type: ${describeVNodeType(vnode.type)}${typeof vnode.props.name === 'string' ? ` (${vnode.props.name})` : ''}`
		);

	const element = createElement(vnode.type, parentNode, vnode.props);
	const mounted: Mounted = { vnode, dom: element, scope, children: [] };
	if (parentInstance) setElementOwner(element, parentInstance);
	mounted.children = mountChildren(root, element, vnode.children, parentInstance, mounted.scope);
	updateProps(root, element, {}, vnode.props, mounted.scope);
	return mounted;
}
