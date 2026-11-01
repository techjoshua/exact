import type { AnyComponentFunction } from '@exactjs/core';
import type { CoreHydrationRoot, HydrateOptions } from '../../hydrate/src/types.js';
type Api = {
	component: AnyComponentFunction;
	observe(callback: () => void): void;
	operation: typeof import('@exactjs/core/runtime/component-operations').createCompiledComponentInputReceipt;
	registry: typeof import('@exactjs/core/runtime/registry').createCompiledComponentRegistry;
	hydrate(
		operation: ReturnType<Api['operation']>,
		container: Element,
		options?: HydrateOptions
	): CoreHydrationRoot;
	renderRegistry(identity: string): Promise<string>;
};
let sequence = 0;
/** Cancels one selected registry root without activating it or interfering with a sibling sharing its module. */
export async function verifyRootCancellation(
	api: Api,
	document: Document,
	initial: boolean
): Promise<void> {
	const identity = `root-cancellation:${++sequence}`;
	let release!: (component: AnyComponentFunction) => void;
	const loaded = new Promise<AnyComponentFunction>((resolve) => {
		release = resolve;
	});
	let loads = 0;
	const Client = api.registry(identity, 'Views', 'client', ({ lazy }) => ({
		panel: lazy(() => {
			loads++;
			return loaded;
		})
	}));
	const html = await api.renderRegistry(identity);
	const retired = document.createElement('main');
	const sibling = document.createElement('main');
	retired.innerHTML = sibling.innerHTML = html;
	const button = retired.querySelector('button')!;
	const liveButton = sibling.querySelector('button')!;
	const owner = new AbortController();
	if (initial) owner.abort(null);
	let calls = 0;
	api.observe(() => {
		calls++;
	});
	let root: CoreHydrationRoot | undefined;
	let live: CoreHydrationRoot | undefined;
	try {
		root = api.hydrate(api.operation(Client.panel, {}), retired, { signal: owner.signal });
		const settlement = root.whenSettled().then(
			() => ({ rejected: false, reason: undefined }),
			(reason) => ({ rejected: true, reason })
		);
		if (initial && loads !== 0) throw new Error('Initially canceled root started a module load');
		live = api.hydrate(api.operation(Client.panel, {}), sibling);
		if (!initial) owner.abort(null);
		await new Promise((resolve) => setTimeout(resolve, 0));
		if (retired.hasAttribute('data-exact-hydrated') || retired.querySelector('button') !== button)
			throw new Error('Cancellation activated or replaced the retired root');
		release(api.component);
		await live.whenSettled();
		const outcome = await settlement;
		if (!outcome.rejected || outcome.reason !== null)
			throw new Error('Canceled readiness did not preserve its exact reason');
		button.click();
		if (calls !== 0 || retired.hasAttribute('data-exact-hydrated'))
			throw new Error('Late loading activated a retired root');
		liveButton.click();
		if (Number(calls) !== 1 || sibling.querySelector('button') !== liveButton || loads !== 1)
			throw new Error('Cancellation interfered with shared loading or live sibling identity');
	} finally {
		owner.abort();
		release(api.component);
		root?.dispose();
		live?.dispose();
		api.observe(() => {});
	}
}
type ClientApi = Pick<typeof import('../../hydrate/src/index.js'), 'createExactClient'> & {
	component: AnyComponentFunction;
};
/** Rejects duplicate ownership before installing listeners and preserves the existing root's capabilities. */
export async function verifyRejectedRootConstruction(
	api: ClientApi,
	document: Document
): Promise<void> {
	const container = document.createElement('main');
	const existing = api.createExactClient(container);
	const owner = new AbortController();
	const listeners = new Set<EventListenerOrEventListenerObject>();
	const add = owner.signal.addEventListener.bind(owner.signal);
	const remove = owner.signal.removeEventListener.bind(owner.signal);
	owner.signal.addEventListener = (
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	) => {
		if (type === 'abort' && listener) listeners.add(listener);
		add(type, listener, options);
	};
	owner.signal.removeEventListener = (
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions
	) => {
		if (type === 'abort' && listener) listeners.delete(listener);
		remove(type, listener, options);
	};
	try {
		let rejected = false;
		try {
			api.createExactClient(container, { signal: owner.signal });
		} catch {
			rejected = true;
		}
		if (!rejected || listeners.size)
			throw new Error('Rejected root construction retained cancellation ownership');
		const malformed = document.createElement('main');
		malformed.innerHTML =
			'<div data-exact-client-boundary="one" data-exact-client-name="Panel" data-exact-client-props="{"><button>Count</button></div>';
		let failure: unknown;
		try {
			api.createExactClient(malformed, { signal: owner.signal, islands: { Panel: api.component } });
		} catch (error) {
			failure = error;
		}
		if (!(failure instanceof SyntaxError) || listeners.size)
			throw new Error('Failed bootstrap retained root ownership');
		const recovery = api.createExactClient(malformed);
		try {
			await recovery.whenSettled();
		} finally {
			recovery.dispose();
		}
		existing.registerComponents({ islands: {} });
		await existing.whenSettled();
	} finally {
		existing.dispose();
		owner.abort();
	}
	const fresh = api.createExactClient(container, { signal: owner.signal });
	try {
		await fresh.whenSettled().then(
			() => {
				throw new Error('Fresh canceled owner lost its signal');
			},
			(reason) => {
				if (reason !== owner.signal.reason) throw new Error('Fresh cancellation reason changed');
			}
		);
	} finally {
		fresh.dispose();
	}
}
