import {
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult,
	unwrap,
	watch,
	type Child,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { peek, type EffectScope } from '@exactjs/reactive';
import { stopReplacedChildren } from '../children.js';
import { afterMountedChildren } from '../placement.js';
import type { Mounted, Root } from '../types.js';
import { mountDetachedChildren } from './mounting/children.js';
import { patchChildren } from './patching/children.js';
import { createMarker } from './root-support.js';

/** Mounts one dynamic renderer range without adding policy to the generic mount dispatcher. */
export function mountDynamic(
	root: Root,
	vnode: VNode,
	scope: EffectScope,
	parentInstance: ComponentInstance<any> | undefined,
	parentNode: Node | undefined
): Mounted {
	const marker = createMarker(root, 'dynamic');
	const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
	mounted.children = mountDetachedChildren(
		root,
		dynamicChildren(vnode, parentInstance),
		parentInstance,
		scope,
		parentNode
	);
	installDynamicWatch(root, mounted, vnode, parentInstance);
	return mounted;
}

/** Rebinds an existing dynamic renderer range to its next compiled value. */
export function patchDynamic(
	root: Root,
	parent: Node,
	mounted: Mounted,
	next: VNode,
	parentInstance: ComponentInstance<any> | undefined
): Mounted {
	mounted.vnode = next;
	mounted.stop?.();
	mounted.children = patchChildren(
		root,
		parent,
		mounted.children,
		dynamicChildren(next, parentInstance),
		parentInstance,
		mounted.scope,
		afterMountedChildren(mounted),
		mounted
	);
	installDynamicWatch(root, mounted, next, parentInstance, parent);
	return mounted;
}

function installDynamicWatch(
	root: Root,
	mounted: Mounted,
	vnode: VNode,
	parentInstance: ComponentInstance<any> | undefined,
	fallbackParent?: Node
): void {
	mounted.stop = watch(
		() => {
			const nextChildren = dynamicChildren(vnode, parentInstance);
			const parent = mounted.dom.parentNode ?? fallbackParent;
			if (!parent) return;
			mounted.children = peek(() =>
				patchChildren(
					root,
					parent,
					mounted.children,
					nextChildren,
					parentInstance,
					mounted.scope,
					afterMountedChildren(mounted),
					mounted
				)
			);
		},
		undefined,
		{
			scope: mounted.scope,
			onSchedule: () => stopReplacedChildren(mounted, dynamicChildren(vnode, parentInstance))
		}
	);
}

/** Reads a compiler-authored dynamic range through native readiness and error ownership. */
export function dynamicChildren(
	vnode: VNode,
	parentInstance: ComponentInstance<any> | undefined
): Child[] {
	const inspection = vnode.props.__exactDynamicComponent as
		| Readonly<{ status: string; error?: unknown }>
		| undefined;
	if (inspection?.status === 'pending') {
		const pending = (
			vnode.props.__exactDynamicComponentReadiness as (() => PromiseLike<unknown> | undefined)
		)();
		if (pending) handleComponentSuspension(parentInstance, pending);
		return [];
	}
	if (inspection?.status === 'failed') return dynamicFailure(inspection.error, parentInstance);
	try {
		return normalizeRenderResult(unwrap(vnode.props.value) as Child | Child[]);
	} catch (error) {
		if (isPromiseLike(error)) {
			handleComponentSuspension(parentInstance, error);
			return [];
		}
		return dynamicFailure(error, parentInstance);
	}
}

function dynamicFailure(
	error: unknown,
	parentInstance: ComponentInstance<any> | undefined
): Child[] {
	const fallback = handleComponentError(
		parentInstance,
		createErrorReport(error, 'render', parentInstance, 'dynamic-component')
	);
	return fallback ? normalizeRenderResult(fallback()) : [];
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}
