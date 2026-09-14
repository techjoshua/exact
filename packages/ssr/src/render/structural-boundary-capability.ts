import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import { ssrCapabilities } from './capability-registry.js';
import type { SsrRenderOptions } from './entrypoints.js';
import type { RenderValue } from './execution.js';

/** Completed native Suspense presentation and its selected content state. */
export type SsrSuspenseResult = Readonly<{
	html: string;
	status: 'content' | 'fallback';
}>;

/** Minimal readiness-boundary input supplied by compiler-issued operations. */
export type SsrSuspenseBoundaryInput = Readonly<{
	props: Readonly<Record<string, unknown>>;
	children: readonly Child[];
}>;

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions
) => RenderValue<string>;

/** Native Suspense operations installed only when the server artifact can reach that boundary. */
export type SsrStructuralBoundaryCapability = Readonly<{
	renderSuspense(
		context: SsrContext,
		boundary: SsrSuspenseBoundaryInput,
		parent: AnyComponentInstance | undefined,
		options: SsrRenderOptions,
		renderChildren: RenderChildren
	): Promise<SsrSuspenseResult>;
}>;

const capabilityName = 'structural-boundary';

/** Installs native structural boundary execution for a compiler-selected server artifact. */
export function registerSsrStructuralBoundaryCapability(
	next: SsrStructuralBoundaryCapability
): void {
	ssrCapabilities[capabilityName] = next;
}

/** Renders an asynchronous native Suspense boundary through its selected capability. */
export function renderNativeSuspense(
	context: SsrContext,
	boundary: SsrSuspenseBoundaryInput,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: RenderChildren
): Promise<SsrSuspenseResult> {
	return requiredCapability().renderSuspense(context, boundary, parent, options, renderChildren);
}

function requiredCapability(): SsrStructuralBoundaryCapability {
	const capability = ssrCapabilities[capabilityName] as SsrStructuralBoundaryCapability | undefined;
	if (!capability)
		throw new TypeError(
			'SSR structural boundary execution requires its compiler-selected runtime capability'
		);
	return capability;
}
