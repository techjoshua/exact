import {
	normalizeRenderResult,
	unwrap,
	type AnyComponentInstance,
	type Child
} from '@exactjs/core';
import type { ExactChildRangeReceiptData } from '@exactjs/core/runtime/component-operations';
import type { ExactPreparedServerChildRange } from '@exactjs/core/framework/server-render-structure';
import type { SsrContext, RenderToStringOptions } from '../types.js';
import { exactMarkerId, markerId, markerPair } from '../markup.js';
import { boundOperationEnhancement } from './bound-enhancement-targets.js';
import { renderOperationEnhancements } from './operation-enhancements.js';
import { registerDynamicComponentPreload } from './resource-hints.js';
import type { RenderValue } from './execution.js';

/** Serializes a retained text/range target with its request-local namespace binding. */
export function renderBoundChildRange(
	context: SsrContext,
	operation: object,
	data: ExactPreparedServerChildRange | ExactChildRangeReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	ancestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly Child[],
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		ancestor?: boolean
	) => RenderValue<string>,
	direct = false
): RenderValue<string> {
	const dynamic = 'dynamicComponent' in data && !!data.dynamicComponent;
	if (dynamic && data.markerId) registerDynamicComponentPreload(context, data.markerId);
	return renderOperationEnhancements(
		context,
		boundOperationEnhancement(context, operation),
		() => {
			const children = dynamic ? [] : normalizeRenderResult(unwrap(data.value) as Child | Child[]);
			const identity = direct
				? ''
				: data.markerId
					? `dynamic:${exactMarkerId(data.markerId)}`
					: markerId(context, 'dynamic');
			return markerPair(context, identity, () =>
				renderChildren(context, children, parent, options, ancestor)
			);
		},
		parent,
		options,
		renderChildren,
		operation
	);
}
