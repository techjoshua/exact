import type { AnyComponentInstance, VNode } from '@exactjs/core';
import type { RenderToStringOptions, SsrContext } from '../types.js';

type SsrAsyncOptions = RenderToStringOptions & { taskDeadline?: number };

/** Generic enhancement materialization operations installed only by selected server artifacts. */
export type SsrEnhancementPlanningCapability = Readonly<{
	planBoundary(
		context: SsrContext,
		boundary: VNode,
		parent: AnyComponentInstance | undefined
	): void;
	planBoundaryAsync(
		context: SsrContext,
		boundary: VNode,
		parent: AnyComponentInstance | undefined,
		options: SsrAsyncOptions
	): Promise<void>;
	prepareTarget(
		context: SsrContext,
		boundary: VNode,
		parent: AnyComponentInstance | undefined
	): void;
	prepareTargetAsync(
		context: SsrContext,
		boundary: VNode,
		parent: AnyComponentInstance | undefined,
		options: SsrAsyncOptions
	): Promise<void>;
}>;

let capability: SsrEnhancementPlanningCapability | undefined;

/** Installs enhancement planning for compiler artifacts that can reach generic enhancements. */
export function registerSsrEnhancementPlanningCapability(
	next: SsrEnhancementPlanningCapability
): void {
	capability = next;
}

/** Returns the compiler-selected planning capability or reports a malformed runtime artifact. */
export function ssrEnhancementPlanningCapability(): SsrEnhancementPlanningCapability {
	if (!capability)
		throw new TypeError(
			'SSR enhancement planning requires its compiler-selected generic runtime capability'
		);
	return capability;
}
