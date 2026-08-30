import { createOpaqueOperation } from '@exactjs/core/runtime/component-operations';

/** Dispatch key for SSR output that is already serialized and trusted by the renderer. */
export const exactSerializedSsrHtmlOperation = Symbol.for(
	'@exactjs/ssr-target-operation/serialized-html'
);

type SerializedHtmlTarget<Result> = Readonly<{
	[exactSerializedSsrHtmlOperation](html: string): Result;
}>;

function executeSerializedHtml(this: object, target: object): unknown {
	const html = serializedHtml.get(this);
	if (html === undefined) throw new TypeError('Serialized SSR HTML operation lost its payload');
	return (target as SerializedHtmlTarget<unknown>)[exactSerializedSsrHtmlOperation](html);
}

function executeDeferredSerializedHtml(this: object, target: object): unknown {
	const render = deferredSerializedHtml.get(this);
	if (!render) throw new TypeError('Deferred SSR HTML operation lost its renderer');
	const html = render();
	return html instanceof Promise
		? html.then((value) =>
				(target as SerializedHtmlTarget<unknown>)[exactSerializedSsrHtmlOperation](value)
			)
		: (target as SerializedHtmlTarget<unknown>)[exactSerializedSsrHtmlOperation](html);
}

const serializedHtml = new WeakMap<object, string>();
const deferredSerializedHtml = new WeakMap<object, () => string | Promise<string>>();

/** Carries already-serialized child output through an enhancement without reparsing it. */
export function createSerializedSsrHtmlOperation(html: string): object {
	const operation = createOpaqueOperation(executeSerializedHtml);
	serializedHtml.set(operation, html);
	return operation;
}

/** Defers trusted child serialization until an enhancement has established its target layers. */
export function createDeferredSerializedSsrHtmlOperation(
	render: () => string | Promise<string>
): object {
	const operation = createOpaqueOperation(executeDeferredSerializedHtml);
	deferredSerializedHtml.set(operation, render);
	return operation;
}
