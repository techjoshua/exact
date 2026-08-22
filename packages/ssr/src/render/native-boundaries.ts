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

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined
) => string;

/** Renders a native Suspense boundary synchronously and reports its presentation state. */
export function renderNativeSuspenseSync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	renderChildren: RenderChildren
): { readonly html: string; readonly status: 'content' | 'fallback' } {
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
