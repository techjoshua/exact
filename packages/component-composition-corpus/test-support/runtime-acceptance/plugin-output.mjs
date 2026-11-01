import {
	initializeExactPluginResources,
	processExactOutputSync
} from '@exactjs/plugin-host/runtime';

/** Checks rejected sync hook results settle safely and the next publication still succeeds. */
export async function pluginOutputJourney() {
	const results = [];
	for (const phase of ['transform', 'validate']) {
		for (const kind of ['promise', 'thenable', 'function']) {
			let settled = false;
			const then = (_resolve, reject) => {
				settled = true;
				reject(new Error('forbidden asynchronous output'));
			};
			const value =
				kind === 'promise'
					? Promise.reject(new Error('forbidden asynchronous output')).finally(() => {
							settled = true;
						})
					: kind === 'function'
						? Object.assign(() => {}, { then })
						: { then };
			let rejected = false;
			try {
				processExactOutputSync('draft', { kind: 'html' }, [{ [phase]: () => value }]);
			} catch (error) {
				rejected =
					phase === 'validate'
						? error instanceof AggregateError && error.errors.length === 1
						: error.message === 'Async output transform cannot run in synchronous html output';
			}
			await new Promise((resolve) => setTimeout(resolve, 0));
			results.push(rejected && settled);
		}
	}
	results.push(
		processExactOutputSync('ready', { kind: 'html' }, [
			{
				transform: (value) => value + '-published',
				validate: () => undefined
			}
		]) === 'ready-published'
	);
	for (const scope of ['application', 'request']) results.push(await rollback(scope));
	return results;
}

async function rollback(scope) {
	const factory = scope === 'application' ? 'initializeApplication' : 'initializeRequest';
	const primary = Object.freeze(new Error('initialization failed'));
	const cleanup = new Error('rollback failed');
	const order = [];
	const context = {
		applicationRoot: '/app',
		environment: 'test',
		signal: new AbortController().signal
	};
	const failure = await initializeExactPluginResources(
		[
			{
				[factory]: () => ({
					dispose() {
						order.push('first');
					}
				})
			},
			{
				[factory]: () => ({
					dispose() {
						order.push('second');
						throw cleanup;
					}
				})
			},
			{
				[factory]: () => {
					throw primary;
				}
			}
		],
		scope,
		context
	).catch((error) => error);
	const next = await initializeExactPluginResources([], scope, context);
	return (
		failure instanceof AggregateError &&
		failure.cause === primary &&
		failure.errors[0] === primary &&
		failure.errors[1] instanceof AggregateError &&
		failure.errors[1].errors[0] === cleanup &&
		order.join(',') === 'second,first' &&
		next.length === 0
	);
}
