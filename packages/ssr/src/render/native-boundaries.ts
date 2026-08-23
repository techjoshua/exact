import {
	type AnyComponentInstance,
	ReadinessContext,
	SuspensionContext,
	createReadinessCoordinator,
	normalizeRenderResult,
	unwrap,
	type Child,
	type Component,
	type VNode
} from '@exactjs/core';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import { createExactInternalOwnerArtifact } from '@exactjs/core/framework/component-contracts';
import type { SsrContext } from '../types.js';
import { awaitWithAbort } from './context.js';
import type { SsrRenderOptions } from './entrypoints.js';
import type { SsrSuspenseResult } from './structural-boundary-capability.js';

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined
) => string;

/** Renders a native Suspense boundary synchronously and reports its presentation state. */
export function renderNativeSuspenseSyncCapability(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	renderChildren: RenderChildren
): SsrSuspenseResult {
	const coordinator = createReadinessCoordinator(() => undefined);
	coordinator.beginGeneration();
	const owner = createComponentInstance(
		SsrReadinessOwner,
		{ context: coordinator.context },
		parent,
		context.componentContexts,
		context.componentDomain
	);
	const candidate = renderChildren(context, vnode.children, owner);
	const pending = coordinator.pending > 0;
	const output = pending
		? renderChildren(
				context,
				normalizeRenderResult(unwrap(vnode.props.fallback) as Child | Child[]),
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
	vnode: VNode,
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
	const owner = createComponentInstance(
		SsrReadinessOwner,
		{ context: coordinator.context },
		parent,
		context.componentContexts,
		context.componentDomain
	);
	try {
		const maxPasses = options.maxTaskPasses ?? 10;
		for (let pass = 0; pass < maxPasses; pass++) {
			if (pass) coordinator.beginGeneration();
			const candidate = await renderChildren(context, vnode.children, owner, options);
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

const SsrReadinessOwner = createExactInternalOwnerArtifact(
	function SsrReadinessOwner(
		this: Component<Record<string, never>>,
		props: { context: ReturnType<typeof createReadinessCoordinator>['context'] }
	) {
		const owner = this as AnyComponentInstance;
		owner.contexts.set(ReadinessContext.id, props.context);
		owner.contexts.set(SuspensionContext.id, {
			suspend: (settlement: PromiseLike<unknown>) =>
				props.context.register({
					owner,
					taskGeneration: 0,
					settlement,
					retry: true
				})
		});
		return () => null;
	},
	'@exactjs/ssr:SyncReadinessOwner',
	'server'
);
