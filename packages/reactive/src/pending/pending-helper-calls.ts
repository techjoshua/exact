import { assertPendingAccessorReceiver } from './pending-property-policy.js';
import { unwrap } from '../internal/values.js';
import { PendingReactiveProxies, type PendingProxyContext } from './pending-proxy.js';
import { selectPendingHelperInvocation, selectPendingNativeMethod } from './helper-invocation.js';
import { selectPendingDateMethod } from './pending-date.js';

/** Explicit helper ownership without ambient asynchronous state or alternate helper bodies. */
export interface PendingHelperContext extends PendingProxyContext {
	/** Recognizes a native member already bound to this invocation's receiver and lifetime. */
	isSelectedNativeMethod(value: unknown): value is (...args: unknown[]) => unknown;
}

/** Invokes ordinary helpers with supported pending inputs and preserves their native implementation. */
export class PendingHelperCalls {
	private readonly proxies = new WeakMap<object, PendingReactiveProxies>();

	/** Selects native adapters or invokes the original function with invocation-owned state views. */
	select(
		context: PendingHelperContext,
		original: unknown,
		receiver?: unknown,
		inline = false
	): (...args: unknown[]) => unknown {
		if (context.isSelectedNativeMethod(original)) return original;
		const native =
			selectPendingHelperInvocation(context, original, receiver) ??
			selectPendingNativeMethod(context, original, receiver) ??
			selectPendingDateMethod(context, original, receiver);
		if (native) return native;
		if (receiver && typeof receiver === 'object' && context.owns(receiver))
			assertPendingAccessorReceiver(unwrap(receiver), 'call');
		if (inline)
			return (...args) => {
				context.assertCurrent();
				return Reflect.apply(original as (...args: unknown[]) => unknown, receiver, args);
			};
		const views = this.views(context);
		return (...args) => {
			context.assertCurrent();
			const result = Reflect.apply(
				original as (...args: unknown[]) => unknown,
				views.wrap(receiver),
				args.map((value) => views.wrap(value))
			);
			return result instanceof Promise
				? result.then((value) => views.source(value))
				: views.source(result);
		};
	}

	/** Supplies native syntax with a view only when the supplied object belongs to this invocation. */
	view<Value>(context: PendingHelperContext, value: Value, copy = false): Value {
		if (
			copy &&
			value &&
			(typeof value === 'object' || typeof value === 'function') &&
			!context.owns(value)
		)
			return value;
		return this.views(context).wrap(value, copy);
	}

	/** Restores an expression's direct result from its invocation facade. */
	value<Value>(context: PendingHelperContext, value: Value): Value {
		return this.proxies.get(context)?.source(value) ?? value;
	}

	private views(context: PendingHelperContext): PendingReactiveProxies {
		let views = this.proxies.get(context);
		if (!views) this.proxies.set(context, (views = new PendingReactiveProxies(context)));
		return views;
	}
}
