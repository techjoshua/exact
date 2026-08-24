import type { VNode } from '@exactjs/core';
import { readPreparedExactCompiledComponentContract } from '@exactjs/core/framework/component-contracts';
import { isReactive, isReactiveValue, unwrap } from '@exactjs/reactive/framework/values';
import { escapeAttr } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import { markerId, markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { clientBoundarySerializationMessage } from './client-boundary-validation.js';
import { componentName } from './component-vnode.js';
import { withSsrReactivePeek } from './reactive-tracking-capability.js';

/** Wraps one SSR-rendered resumable component in its eager client activation boundary. */
export function renderResumableComponentBoundary(
	context: SsrContext,
	vnode: VNode,
	id: string,
	html: string,
	props: Record<string, unknown>
): string {
	if (typeof vnode.type !== 'function') return markerPair(context, id, () => html);
	const contract = readPreparedExactCompiledComponentContract(vnode.type);
	if (!contract.resumption || !contract.continuations.length)
		return markerPair(context, id, () => html);
	const name =
		contract.implementations.find((implementation) => implementation.role === 'root')?.name ??
		componentName(vnode.type);
	const snapshot = withSsrReactivePeek(() => snapshotResumptionProps(props));
	const unsafePath = jsonUnsafePath(snapshot);
	if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	const payload = serializeHydrationPayload({ props: snapshot });
	const boundary = `<div data-exact-client-boundary="${escapeAttr(id)}" data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(payload)}" data-exact-client-resumption="true">${html}</div>`;
	return markerPair(context, markerId(context, 'client-boundary', name, id), () => boundary);
}

/** Detaches resumable boundary props from reactive proxies without invoking accessors. */
function snapshotResumptionProps(
	value: Record<string, unknown>,
	seen = new WeakMap<object, unknown>()
): Record<string, unknown> {
	return snapshotResumptionValueWithPolicy(value, seen, true) as Record<string, unknown>;
}

function snapshotResumptionValueWithPolicy(
	value: unknown,
	seen: WeakMap<object, unknown>,
	evaluateReactiveValues: boolean
): unknown {
	if (isReactiveValue(value)) {
		if (!evaluateReactiveValues) return value;
		value = unwrap(value);
	}
	const raw = isReactive(value) ? unwrap(value) : value;
	if (!raw || typeof raw !== 'object') return raw;
	if (!Array.isArray(raw) && Object.getPrototypeOf(raw) !== Object.prototype) return raw;
	const previous = seen.get(raw);
	if (previous) return previous;
	const output: unknown[] | Record<string, unknown> = Array.isArray(raw) ? [] : {};
	seen.set(raw, output);
	for (const key of Object.keys(raw)) {
		const descriptor = Object.getOwnPropertyDescriptor(raw, key);
		if (!descriptor) continue;
		if (!('value' in descriptor)) {
			Object.defineProperty(output, key, {
				configurable: true,
				enumerable: true,
				get: descriptor.get
			});
			continue;
		}
		Object.defineProperty(output, key, {
			configurable: true,
			enumerable: true,
			writable: true,
			value: snapshotResumptionValueWithPolicy(
				descriptor.value,
				seen,
				evaluateReactiveValues && key !== 'children'
			)
		});
	}
	return output;
}
