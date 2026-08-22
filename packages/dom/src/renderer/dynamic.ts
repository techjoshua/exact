import {
	type AnyComponentInstance,
	createErrorReport,
	handleComponentError,
	handleComponentSuspension,
	normalizeRenderResult,
	unwrap,
	watch,
	type Child,
	type VNode
} from '@exactjs/core';
import { peek, type EffectScope } from '@exactjs/reactive/framework/runtime';
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
	parentInstance: AnyComponentInstance | undefined,
	parentNode: Node | undefined
): Mounted {
	const marker = createMarker(root, 'dynamic');
	const mounted: Mounted = { vnode, dom: marker, scope, children: [] };
	const initialChildren = dynamicChildren(vnode, parentInstance);
	mounted.dynamicChildren = initialChildren;
	mounted.children = mountDetachedChildren(
		root,
		initialChildren,
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
	parentInstance: AnyComponentInstance | undefined
): Mounted {
	mounted.vnode = next;
	mounted.stop?.();
	const nextChildren = dynamicChildren(next, parentInstance);
	mounted.dynamicChildren = nextChildren;
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
	installDynamicWatch(root, mounted, next, parentInstance, parent);
	return mounted;
}

function installDynamicWatch(
	root: Root,
	mounted: Mounted,
	vnode: VNode,
	parentInstance: AnyComponentInstance | undefined,
	fallbackParent?: Node
): void {
	mounted.stop = watch(
		() => {
			const nextChildren = dynamicChildren(vnode, parentInstance);
			if (sameDynamicChildren(mounted.dynamicChildren, nextChildren)) return;
			const parent = mounted.dom.parentNode ?? fallbackParent;
			if (!parent) return;
			mounted.dynamicChildren = nextChildren;
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
			onSchedule:
				vnode.props.__exactScalarDynamic === true
					? undefined
					: () => stopReplacedChildren(mounted, dynamicChildren(vnode, parentInstance))
		}
	);
}

/** Avoids reconciliation when a dependency changed without changing a range's normalized output. */
function sameDynamicChildren(
	previous: readonly Child[] | undefined,
	next: readonly Child[]
): boolean {
	if (!previous || previous.length !== next.length) return false;
	for (let index = 0; index < next.length; index++) {
		if (!Object.is(previous[index], next[index])) return false;
	}
	return true;
}

/** Reads a compiler-authored dynamic range through native readiness and error ownership. */
export function dynamicChildren(
	vnode: VNode,
	parentInstance: AnyComponentInstance | undefined
): Child[] {
	const inspection = vnode.props.__exactDynamicComponent as
		| Readonly<{ status: string; error?: unknown }>
		| undefined;
	if (inspection?.status === 'pending') {
		const pending = (
			vnode.props.__exactDynamicComponentReadiness as () => PromiseLike<unknown> | undefined
		)();
		if (pending) handleComponentSuspension(parentInstance, pending);
		return [];
	}
	if (inspection?.status === 'failed') return dynamicFailure(inspection.error, parentInstance);
	return readDynamicChildren(() => vnode.props.value, parentInstance, 'dynamic-component');
}

/** Normalizes one compiled dynamic reader through shared suspension and error ownership. */
export function readDynamicChildren(
	read: () => unknown,
	parentInstance: AnyComponentInstance | undefined,
	label: string
): Child[] {
	try {
		return normalizeRenderResult(unwrap(read()) as Child | Child[]);
	} catch (error) {
		if (isPromiseLike(error)) {
			handleComponentSuspension(parentInstance, error);
			return [];
		}
		return dynamicFailure(error, parentInstance, label);
	}
}

function dynamicFailure(
	error: unknown,
	parentInstance: AnyComponentInstance | undefined,
	label = 'dynamic-component'
): Child[] {
	const fallback = handleComponentError(
		parentInstance,
		createErrorReport(error, 'render', parentInstance, label)
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
