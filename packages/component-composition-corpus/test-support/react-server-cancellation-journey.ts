import type { ReactNode } from '@exactjs/react-compat';
type ServerApi = Pick<
	typeof import('@exactjs/react-compat'),
	'createElement' | 'lazy' | 'Suspense'
> &
	Pick<
		typeof import('@exactjs/react-dom-compat/server'),
		'renderToString' | 'renderToReadableStream'
	>;
function check(value: boolean, message: string): void {
	if (!value) throw new Error('React server cancellation: ' + message);
}
async function rejection(value: Promise<unknown>): Promise<unknown> {
	try {
		await value;
	} catch (error) {
		return error;
	}
	throw new Error('Expected server rejection');
}

/** Checks exact abort reasons and cancellation of unresolved work through public server APIs. */
export async function verifyReactServerCancellation(api: ServerApi): Promise<void> {
	for (const reason of [null, false, 0, 'cancelled']) {
		const controller = new AbortController();
		controller.abort(reason);
		let caught: unknown = Symbol('not thrown');
		try {
			api.renderToString('value', { signal: controller.signal });
		} catch (error) {
			caught = error;
		}
		check(caught === reason, 'synchronous reason identity');
		check(
			(await rejection(api.renderToReadableStream('value', { signal: controller.signal }))) ===
				reason,
			'pre-aborted stream reason identity'
		);
	}
	const controller = new AbortController();
	const Pending = api.lazy(() => new Promise<{ default: () => null }>(() => {}));
	const rendering = api.renderToReadableStream(
		api.createElement(api.Suspense, { fallback: 'waiting' }, api.createElement(Pending)),
		{ signal: controller.signal }
	);
	controller.abort(null);
	check((await rejection(rendering)) === null, 'pending Suspense null reason');

	const direct = new AbortController();
	let finish!: (value: ReactNode) => void;
	const child = new Promise<ReactNode>((resolve) => {
		finish = resolve;
	});
	const pending = api.renderToReadableStream(child as unknown as ReactNode, {
		signal: direct.signal
	});
	let observed = false;
	void pending.catch(() => {
		observed = true;
	});
	direct.abort('promise cancelled');
	for (let i = 0; i < 20; i++) await Promise.resolve();
	const cancelledBeforeSettlement = observed;
	finish('late');
	check((await rejection(pending)) === 'promise cancelled', 'direct child reason');
	check(cancelledBeforeSettlement, 'direct child cancellation precedes settlement');
	const ready = await api.renderToReadableStream(Promise.resolve('ready') as unknown as ReactNode);
	check((await new Response(ready).text()) === 'ready', 'successful promise value retained');
	const failure = new Error('child failed');
	check(
		(await rejection(
			api.renderToReadableStream(Promise.reject(failure) as unknown as ReactNode)
		)) === failure,
		'child failure identity'
	);
}
