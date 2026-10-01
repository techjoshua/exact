import { unwrap } from '../internal/values.js';
import { pendingReactiveHelperVariant } from './helper-variants.js';
import { PendingReactiveProxies, type PendingProxyContext } from './pending-proxy.js';
import { selectPendingHelperInvocation, selectPendingNativeMethod } from './helper-invocation.js';
import { selectPendingDateMethod } from './pending-date.js';

/** Retains alias-specific receiver policy while sharing one invocation's journal. */
export interface PendingHelperContext extends PendingProxyContext {
	withReceiver(receiver: object, home?: object): PendingHelperContext;
	/** Retains the selected reactive alias when a bound callable escapes this invocation. */
	receiverAlias(receiver: unknown): unknown;
}

/** Owns helper selection, external argument facades and native authored arguments identity. */
export class PendingHelperCalls {
	private readonly proxies = new WeakMap<object, PendingReactiveProxies>();
	private readonly argumentsViews = new WeakMap<IArguments, IArguments>();

	/** Selects compiled work or supplies unchanged code with an explicit pending facade. */
	select(
		context: PendingHelperContext,
		original: unknown,
		receiver?: unknown,
		inline = false
	): (...args: unknown[]) => unknown {
		const native =
			selectPendingHelperInvocation(context, original, receiver) ??
			selectPendingNativeMethod(context, original, receiver) ??
			selectPendingDateMethod(context, original, receiver);
		if (native) return native;
		const variant = pendingReactiveHelperVariant(original);
		if (!variant) {
			if (inline)
				return (...args) =>
					Reflect.apply(original as (...args: unknown[]) => unknown, receiver, args);
			let views = this.proxies.get(context);
			if (!views) this.proxies.set(context, (views = new PendingReactiveProxies(context)));
			const selected = views;
			return (...args) => {
				const result = Reflect.apply(
					original as (...args: unknown[]) => unknown,
					selected.wrap(context.receiverAlias(receiver)),
					args.map((value) => selected.wrap(context.receiverAlias(value)))
				);
				return result instanceof Promise
					? result.then((value) => selected.source(value))
					: selected.source(result);
			};
		}
		const target = variant.rawReceiver ? unwrap(receiver) : receiver;
		const owner =
			(variant.rawReceiver || variant.home !== undefined || unwrap(receiver) !== receiver) &&
			receiver &&
			(typeof receiver === 'object' || typeof receiver === 'function')
				? context.withReceiver(receiver, variant.home)
				: variant.home
					? context.withReceiver(variant.home, variant.home)
					: context;
		return (...args) => {
			const inputs = variant.pendingParameters ? [...args] : args;
			if (variant.pendingParameters)
				for (const index of variant.pendingParameters)
					inputs[index] = this.view(owner, inputs[index]);
			const result = Reflect.apply(variant.work, target, [owner, ...inputs]);
			return result === target ? receiver : result;
		};
	}

	/** Supplies a native JavaScript expression with its invocation-owned facade. */
	view<Value>(context: PendingHelperContext, value: Value): Value {
		let proxies = this.proxies.get(context);
		if (!proxies) this.proxies.set(context, (proxies = new PendingReactiveProxies(context)));
		return proxies.wrap(value);
	}

	/** Restores an expression's authored receiver after native optional evaluation. */
	value<Value>(context: PendingHelperContext, value: Value): Value {
		return this.proxies.get(context)?.source(value) ?? value;
	}

	/** Restores the native arguments object once for a compiler-owned companion invocation. */
	arguments(context: PendingHelperContext, input: IArguments): IArguments {
		let view = this.argumentsViews.get(input);
		if (!view) {
			view = Reflect.apply(
				function () {
					// The compiler contract requires a native arguments object, rather than a rest array.
					// eslint-disable-next-line prefer-rest-params
					return arguments;
				},
				undefined,
				Array.prototype.slice.call(input, 1).map((value: unknown) => this.value(context, value))
			) as IArguments;
			this.argumentsViews.set(input, view);
		}
		return view;
	}
}
