import {
	createReadinessCoordinator,
	normalizeRenderResult,
	unwrap,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import type { SsrContext } from '../types.js';
import { awaitWithAbort } from './context.js';
import type { SsrRenderOptions } from './entrypoints.js';
import type { RenderValue } from './execution.js';
import { createSsrReadinessOwner } from './readiness-owner.js';
import type {
	SsrSuspenseBoundaryInput,
	SsrSuspenseResult
} from './structural-boundary-capability.js';

/** Renders a native Suspense boundary asynchronously until its generation is stable. */
export async function renderNativeSuspenseCapability(
	context: SsrContext,
	boundary: SsrSuspenseBoundaryInput,
	parent: AnyComponentInstance | undefined,
	options: SsrRenderOptions,
	renderChildren: (
		context: SsrContext,
		children: readonly Child[],
		parent: AnyComponentInstance | undefined,
		options: SsrRenderOptions
	) => RenderValue<string>
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
