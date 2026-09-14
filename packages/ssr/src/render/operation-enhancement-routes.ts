import type { CompiledEnhancementNode } from '@exactjs/core';
import type { SsrContext } from '../types.js';

/** Publishes route cut points declared by this operation to its active ancestor enhancements. */
export function beginRoutes(
	context: SsrContext,
	enhancement: CompiledEnhancementNode
): NonNullable<SsrContext['enhancementOperationRoutes']> {
	const routes = enhancement.entries
		.filter((entry) => entry.root === undefined)
		.map((entry) => ({
			identity: entry.identity,
			props: entry.props,
			componentDepth: context.enhancementOperationComponentDepth ?? 0,
			consumed: false,
			nested: false
		}));
	if (!routes.length) return [];
	(context.enhancementOperationRoutes ??= []).push(...routes);
	return routes;
}

/** Restores the route stack after its owning operation exits. */
export function endRoutes(context: SsrContext, count: number): void {
	if (count) context.enhancementOperationRoutes!.splice(-count, count);
}

/** Finds the most recent unconsumed root route at the current component depth. */
export function directRootRoute(context: SsrContext, enhancement: CompiledEnhancementNode) {
	const roots = new Set(
		enhancement.entries.filter((entry) => entry.root === true).map((entry) => entry.identity)
	);
	const depth = context.enhancementOperationComponentDepth ?? 0;
	return [...(context.enhancementOperationRoutes ?? [])]
		.reverse()
		.find(
			(route) => !route.consumed && route.componentDepth === depth && roots.has(route.identity)
		);
}

/** Marks an ancestor route claimed by a nested component root. */
export function markNestedRootRoute(
	context: SsrContext,
	enhancement: CompiledEnhancementNode
): void {
	const roots = new Set(
		enhancement.entries.filter((entry) => entry.root === true).map((entry) => entry.identity)
	);
	const depth = context.enhancementOperationComponentDepth ?? 0;
	const route = [...(context.enhancementOperationRoutes ?? [])]
		.reverse()
		.find(
			(candidate) =>
				!candidate.consumed && candidate.componentDepth < depth && roots.has(candidate.identity)
		);
	if (route) route.nested = true;
}

/** Transfers one accumulated string prefix to the first pending nested enhancement route. */
export function captureNestedEnhancementStringPrefix(context: SsrContext, html: string): string {
	if (html === '') return html;
	const depth = context.enhancementOperationComponentDepth ?? 0;
	for (const route of context.enhancementOperationRoutes ?? []) {
		if (!route.nested || route.consumed || route.nestedBefore !== undefined) continue;
		if (route.componentDepth !== depth) continue;
		route.nestedBefore = html;
		return '';
	}
	return html;
}
