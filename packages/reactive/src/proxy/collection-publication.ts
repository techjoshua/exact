import { notifyReactiveAccessorWrite } from './accessor-dependencies.js';
import { isReactive, unwrap } from '../internal/values.js';
import { reactiveProxyPolicy } from '../internal/symbols.js';
import type { ReactiveOptions } from '../internal/types.js';
import { wrapReactiveCollectionValue } from './create-base.js';
import type { ReactiveProxyRecord } from './capabilities.js';

/** Reads the existing reactive policy so pending writes reject readonly access before staging. */
export function reactiveProxyOptions(value: object): ReactiveOptions | undefined {
	if (!isReactive(value)) return undefined;
	return (value as { [reactiveProxyPolicy]?: ReactiveProxyRecord })[reactiveProxyPolicy]?.options;
}

/**
 * Executes a selected native Map or Set operation with the receiving proxy's notifications and
 * policy. Authored overrides are not reselected during publication. No collection snapshot is made.
 */
export function applyNativeReactiveCollection(
	receiver: object,
	key: PropertyKey,
	args: unknown[]
): unknown {
	const target = unwrap(receiver);
	if (!(target instanceof Map || target instanceof Set))
		throw new TypeError('Expected a native collection');
	const selected = Reflect.get(target instanceof Map ? Map.prototype : Set.prototype, key);
	if (typeof selected !== 'function') throw new TypeError('Expected a native collection operation');
	if (!isReactive(receiver)) return Reflect.apply(selected, target, args);
	const record = (receiver as { [reactiveProxyPolicy]: ReactiveProxyRecord })[reactiveProxyPolicy];
	if (!record.collectionMember) throw new TypeError('Reactive state lacks collection support');
	const member = record.collectionMember(
		target,
		key,
		receiver,
		record.options,
		(current, dependency) => wrapReactiveCollectionValue(receiver, current, dependency),
		undefined,
		selected
	);
	return Reflect.apply(member as (...input: unknown[]) => unknown, receiver, args);
}

/** Publishes private storage changes to observed accessors without evaluating authored getters. */
export function notifyReactivePrivateWrite(receiver: object): void {
	if (isReactive(receiver)) notifyReactiveAccessorWrite(unwrap(receiver));
}
