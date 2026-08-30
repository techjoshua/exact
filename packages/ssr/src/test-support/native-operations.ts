import { Activity, Fragment, Portal, Suspense, Target, UnsafeHtml } from '@exactjs/core';
import { ServerBoundary, ServerSlot } from '@exactjs/core/runtime/render-operations';
import {
	createCompiledActivityReceipt,
	createCompiledFragmentReceipt,
	createCompiledIntrinsicReceipt,
	createCompiledKeyedChildReceipt,
	createCompiledPortalReceipt,
	createCompiledServerBoundaryReceipt,
	createCompiledServerSlotReceipt,
	createCompiledSuspenseReceipt,
	createCompiledTargetReceipt,
	createCompiledUnsafeHtmlReceipt
} from '@exactjs/core/runtime/component-operations';
import { createServerTestComponentReceipt } from '@exactjs/testing/internal/fixtures';
import type { AnyAuthoredComponentFunction } from '@exactjs/core';

/** Issues the operation shape emitted by server compilation for focused SSR fixtures. */
export function createOperation(
	type: unknown,
	props: Record<string, unknown> | null,
	...children: unknown[]
): object {
	if (typeof type === 'string') return createCompiledIntrinsicReceipt(type, props, ...children);
	if (type === Fragment) {
		const list = props?.list as
			| {
					collection: Iterable<unknown>;
					key(item: unknown): string;
					render(item: unknown): unknown;
			  }
			| undefined;
		if (list)
			return createCompiledFragmentReceipt(
				props,
				...[...list.collection].map((item) =>
					createCompiledKeyedChildReceipt(list.render(item), String(list.key(item)))
				)
			);
		return createCompiledFragmentReceipt(props, ...children);
	}
	if (type === Activity) return createCompiledActivityReceipt(props, ...children);
	if (type === Suspense) return createCompiledSuspenseReceipt(props, ...children);
	if (type === Target) return createCompiledTargetReceipt(props, ...children);
	if (type === Portal) return createCompiledPortalReceipt(props, ...children);
	if (type === ServerBoundary) return createCompiledServerBoundaryReceipt(props, ...children);
	if (type === ServerSlot) return createCompiledServerSlotReceipt(props, ...children);
	if (type === UnsafeHtml) return createCompiledUnsafeHtmlReceipt(props);
	if (typeof type === 'function')
		return createServerTestComponentReceipt(
			type as AnyAuthoredComponentFunction,
			props,
			...children
		);
	throw new TypeError('SSR native fixtures require a compiler-supported operation type');
}

/** Alias used by fixtures whose source models compiler-closed intrinsic output. */
export const createCompiledOperation = createOperation;
