import { pendingPropertyDescriptor } from './pending-reflection.js';
import { assertPendingAccessorReceiver } from './pending-property-policy.js';
import { unwrap } from '../internal/values.js';
import { reactiveProxyOptions } from '../proxy/collection-publication.js';
import { proxyMarker, rawTarget, reactiveProxyPolicy } from '../internal/symbols.js';
import { pendingReactiveHelperVariant } from './helper-variants.js';
import { isPendingNativeCollectionSize } from './pending-collections.js';
import type { PendingReactiveState } from './pending-state-contract.js';
import { selectPendingDateMethod } from './pending-date.js';

/** Supplies invocation ownership to a facade without retaining ambient asynchronous state. */
export interface PendingProxyContext extends PendingReactiveState {
	/** Fences accessor setters before their authored effects execute. */
	assertCurrent(): void;
	owns(value: object): boolean;
	retain(value: unknown): unknown;
	keys(target: object): (string | symbol)[];
	descriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined;
}

/** Gives unchanged helpers a stable view of pending state and generation-fenced writes. */
export class PendingReactiveProxies {
	private readonly views = new WeakMap<object, Map<number, object>>();
	private readonly sources = new WeakMap<object, object>();

	constructor(private readonly context: PendingProxyContext) {}

	/** Preserves ordinary arguments and memoizes aliases. Native copy views also select external compiled getters without rebinding methods or wrapping property values. */
	wrap<Value>(value: Value, copy = false): Value {
		if (!value || (typeof value !== 'object' && !(copy && typeof value === 'function')))
			return value;
		if (!copy && !this.context.owns(value)) return value;
		const raw = unwrap(value),
			context = this.context;
		const readonly = Boolean(reactiveProxyOptions(value)?.readonly);
		const mode = Number(readonly) + (copy ? 2 : 0);
		let aliases = this.views.get(raw);
		const cached = aliases?.get(mode);
		if (cached) return cached as Value;
		if (!aliases) this.views.set(raw, (aliases = new Map()));
		const selected = new Map<PropertyKey, { original: unknown; bound: unknown }>();
		const view: object = new Proxy(raw, {
			get: (_target, key, receiver) => {
				if (key === proxyMarker) return true;
				if (key === rawTarget) return raw;
				if (key === reactiveProxyPolicy) return Reflect.get(value, key);
				if (copy) return context.read(value, key);
				const descriptor = pendingPropertyDescriptor(raw, key);
				if (receiver !== view && descriptor?.get)
					throw new TypeError('Pending accessor reflection requires its original receiver');
				let result: unknown;
				if (
					descriptor?.get &&
					!pendingReactiveHelperVariant(descriptor.get) &&
					!isPendingNativeCollectionSize(raw, key, descriptor.get)
				) {
					assertPendingAccessorReceiver(raw, key);
					result = context.retain(Reflect.apply(descriptor.get, view, []));
				} else result = context.read(value, key);
				if (typeof result === 'function' && key !== 'constructor') {
					const previous = selected.get(key);
					if (previous?.original === result) return previous.bound;
					let bound: (...args: unknown[]) => unknown;
					if (Array.isArray(raw) || raw instanceof Map || raw instanceof Set) {
						const operation = context.method(value, key);
						bound = (...args) => this.result(operation(...this.arguments(key, args, view)));
					} else if (pendingReactiveHelperVariant(result)) {
						const operation = context.helper(result, value);
						bound = (...args) => this.result(operation(...args));
					} else {
						const operation = selectPendingDateMethod(context, result, value);
						if (operation) bound = (...args) => this.result(operation(...args));
						else {
							assertPendingAccessorReceiver(raw, key);
							bound = (...args) => this.result(Reflect.apply(result, view, args));
						}
					}
					selected.set(key, { original: result, bound });
					return bound;
				}
				const wrapped = this.wrap(result);
				if (
					descriptor &&
					!descriptor.configurable &&
					'value' in descriptor &&
					!descriptor.writable &&
					wrapped !== descriptor.value
				)
					throw new TypeError(
						`Frozen task property ${String(key)} cannot expose a mutable pending facade`
					);
				return wrapped;
			},
			set: (_target, key, next, receiver) => {
				context.assertCurrent();
				if (receiver !== view)
					throw new TypeError('Pending reflective writes require their original receiver');
				const options = reactiveProxyOptions(value);
				if (options?.readonly) {
					options.onReadonlyWrite?.(key);
					throw new TypeError('Cannot write through readonly task state');
				}
				const descriptor = pendingPropertyDescriptor(raw, key);
				if (descriptor?.set && !pendingReactiveHelperVariant(descriptor.set)) {
					assertPendingAccessorReceiver(raw, key);
					Reflect.apply(descriptor.set, view, [next]);
				} else context.write(value, key, this.source(next));
				return true;
			},
			deleteProperty: (_target, key) => context.remove(value, key),
			has: (_target, key) => context.has(value, key),
			ownKeys: () => (copy && !context.owns(value) ? Reflect.ownKeys(value) : context.keys(value)),
			getOwnPropertyDescriptor: (_target, key) => {
				const descriptor = context.descriptor(value, key);
				if (copy) return descriptor;
				if (
					!descriptor ||
					!('value' in descriptor) ||
					!descriptor.value ||
					typeof descriptor.value !== 'object'
				)
					return descriptor;
				const wrapped = this.wrap(context.read(value, key));
				if (!descriptor.configurable && !descriptor.writable && wrapped !== descriptor.value)
					throw new TypeError(
						`Frozen task property ${String(key)} cannot expose a mutable pending facade`
					);
				return { ...descriptor, value: wrapped };
			},
			defineProperty: () => {
				throw new TypeError(
					'Reflective pending task writes require compiler-supported mutation syntax'
				);
			},
			setPrototypeOf: () => {
				throw new TypeError('Cannot change the prototype of pending task state');
			},
			preventExtensions: () => {
				throw new TypeError('Cannot freeze or seal pending task state');
			}
		});
		aliases.set(mode, view);
		this.sources.set(view, value);
		return view as Value;
	}

	/** Removes only this invocation's facade when a helper returns an authored argument. */
	source<Value>(value: Value): Value {
		return value && typeof value === 'object'
			? ((this.sources.get(value) as Value | undefined) ?? value)
			: value;
	}

	private result(value: unknown): unknown {
		if (
			value &&
			typeof value === 'object' &&
			Symbol.iterator in value &&
			!(Array.isArray(value) || value instanceof Map || value instanceof Set)
		) {
			const values = value as Iterable<unknown>;
			const wrap = (entry: unknown) =>
				Array.isArray(entry) ? entry.map((part) => this.wrap(part)) : this.wrap(entry);
			return (function* () {
				for (const entry of values) yield wrap(entry);
			})();
		}
		return this.wrap(value);
	}

	private arguments(key: PropertyKey, args: unknown[], owner: object): unknown[] {
		const inputs = args.map((value) => this.source(value));
		if (
			[
				'forEach',
				'map',
				'filter',
				'some',
				'every',
				'find',
				'findIndex',
				'findLast',
				'findLastIndex',
				'reduce',
				'reduceRight',
				'sort'
			].includes(String(key)) &&
			typeof args[0] === 'function'
		) {
			const callback = args[0];
			inputs[0] = (...values: unknown[]) =>
				Reflect.apply(
					callback,
					key === 'reduce' || key === 'reduceRight' ? undefined : args[1],
					values.map((value) => this.wrap(value === this.source(owner) ? owner : value))
				);
		}
		return inputs;
	}
}
