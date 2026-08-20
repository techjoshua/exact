import {
	ReadinessContext,
	SuspensionContext,
	createReadinessCoordinator,
	normalizeRenderResult,
	unwrap,
	type Child,
	type Component,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { createComponentInstance } from '@exactjs/core/runtime/render';
import type { SsrContext } from '../types.js';

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: ComponentInstance<any> | undefined
) => string;

/** Renders a native Suspense boundary synchronously and reports its presentation state. */
export function renderNativeSuspenseSync(
	context: SsrContext,
	vnode: VNode,
	parent: ComponentInstance<any> | undefined,
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

function SsrReadinessOwner(
	this: Component<Record<string, never>>,
	props: { context: ReturnType<typeof createReadinessCoordinator>['context'] }
) {
	this.setContext(ReadinessContext, props.context);
	this.setContext(SuspensionContext, {
		suspend: (settlement) =>
			props.context.register({
				owner: this as unknown as ComponentInstance<any>,
				taskGeneration: 0,
				settlement,
				retry: true
			})
	});
	return () => null;
}
