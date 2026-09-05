import {
	type AnyComponentInstance,
	createReadinessCoordinator,
	normalizeRenderResult,
	unwrap,
	type Child
} from '@exactjs/core';
import type { SsrContext } from '../types.js';
import { awaitWithAbort } from './context.js';
import type { SsrRenderOptions } from './entrypoints.js';
import { createSsrReadinessOwner } from './readiness-owner.js';
import type {
	SsrSuspenseBoundaryInput,
	SsrSuspenseResult
} from './structural-boundary-capability.js';
import { SsrScheduledComponentSignal } from './sync-component.js';

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined
) => string;

/** Renders a native Suspense boundary synchronously and reports its presentation state. */
export function renderNativeSuspenseSyncCapability(
	context: SsrContext,
	boundary: SsrSuspenseBoundaryInput,
	parent: AnyComponentInstance | undefined,
	renderChildren: RenderChildren
): SsrSuspenseResult {
	const coordinator = createReadinessCoordinator(() => undefined);
	coordinator.beginGeneration();
	const owner = createSsrReadinessOwner(context, parent, coordinator.context);
	let candidate = '';
	let scheduled = false;
	try {
		candidate = renderChildren(context, boundary.children, owner);
	} catch (error) {
		if (!(error instanceof SsrScheduledComponentSignal)) throw error;
		scheduled = true;
	}
	const pending = scheduled || coordinator.pending > 0;
	const output = pending
		? renderChildren(
				context,
				normalizeRenderResult(unwrap(boundary.props.fallback) as Child | Child[]),
				parent
			)
		: candidate;
	coordinator.dispose();
	owner.unmount('ssr suspense complete');
	return { html: output, status: pending ? 'fallback' : 'content' };
}

/** Renders a native Suspense boundary asynchronously until its generation is stable. */
export async function renderNativeSuspenseAsyncCapability(
	context: SsrContext,
	boundary: SsrSuspenseBoundaryInput,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: (
		context: SsrContext,
		children: readonly Child[],
		parent: AnyComponentInstance | undefined,
		options: SsrRenderOptions
	) => Promise<string>
): Promise<SsrSuspenseResult> {
	const coordinator = createReadinessCoordinator(() => undefined, { commitSettled: true });
	coordinator.beginGeneration();
	const owner = createSsrReadinessOwner(context, parent, coordinator.context);
	try {
		const maxPasses = context.maxTaskPasses;
		for (let pass = 0; pass < maxPasses; pass++) {
			if (pass) coordinator.beginGeneration();
			const scheduledBefore = options.streamingScheduledComponents?.length ?? 0;
			const candidate = await renderChildren(context, boundary.children, owner, options);
			if (
				options.streamingScheduledComponents &&
				(options.streamingScheduledComponents.length > scheduledBefore || coordinator.pending > 0)
			)
				return {
					html: await renderChildren(
						context,
						normalizeRenderResult(unwrap(boundary.props.fallback) as Child | Child[]),
						parent,
						options
					),
					status: 'fallback'
				};
			const readiness = await awaitWithAbort(
				coordinator.whenReady(),
				options.signal,
				options.taskDeadline
			);
			if (readiness.generation !== coordinator.generation || readiness.retry) continue;
			return { html: candidate, status: 'content' };
		}
		throw new Error(
			`eXact async SSR Suspense boundary did not stabilize after ${maxPasses} render passes`
		);
	} finally {
		coordinator.dispose();
		owner.unmount('ssr suspense complete');
	}
}
