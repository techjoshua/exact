import type { AnyComponentInstance, Child, VNode } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { realmSsrCapability, registerRealmSsrCapability } from './realm-capability.js';

/** Completed native Suspense presentation and its selected content state. */
export type SsrSuspenseResult = Readonly<{
	html: string;
	status: 'content' | 'fallback';
}>;

type RenderChildrenSync = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined
) => string;

type RenderChildrenAsync = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
) => Promise<string>;

/** Native Suspense operations installed only when the server artifact can reach that boundary. */
export type SsrStructuralBoundaryCapability = Readonly<{
	renderSuspenseSync(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined,
		renderChildren: RenderChildrenSync
	): SsrSuspenseResult;
	renderSuspenseAsync(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined,
		options: SsrRenderOptions,
		renderChildren: RenderChildrenAsync
	): Promise<SsrSuspenseResult>;
}>;

const capabilityName = 'structural-boundary';

/** Installs native structural boundary execution for a compiler-selected server artifact. */
export function registerSsrStructuralBoundaryCapability(
	next: SsrStructuralBoundaryCapability
): void {
	registerRealmSsrCapability(capabilityName, next);
}

/** Renders a synchronous native Suspense boundary through its selected capability. */
export function renderNativeSuspenseSync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	renderChildren: RenderChildrenSync
): SsrSuspenseResult {
	return requiredCapability().renderSuspenseSync(context, vnode, parent, renderChildren);
}

/** Renders an asynchronous native Suspense boundary through its selected capability. */
export function renderNativeSuspenseAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: RenderChildrenAsync
): Promise<SsrSuspenseResult> {
	return requiredCapability().renderSuspenseAsync(context, vnode, parent, options, renderChildren);
}

function requiredCapability(): SsrStructuralBoundaryCapability {
	const capability = realmSsrCapability<SsrStructuralBoundaryCapability>(capabilityName);
	if (!capability)
		throw new TypeError(
			'SSR structural boundary execution requires its compiler-selected runtime capability'
		);
	return capability;
}
