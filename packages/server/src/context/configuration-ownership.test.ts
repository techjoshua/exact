import { expect, it, onTestFinished } from 'vitest';
import { createExactContextRuntime, openExactRequestScope } from '../index.js';
import { context } from '../test-support/server.js';

it('retains lazy inherited accessors and isolates request overrides on frozen configuration', async ({
	onTestFinished
}) => {
	const runtime = createExactContextRuntime();
	onTestFinished(() => runtime.dispose());
	let unrelatedReads = 0;
	class Configuration {
		contract = context().contract;
		contextRuntime = runtime;
		#allowed = true;
		get authorize() {
			return () => this.#allowed;
		}
		get unused() {
			unrelatedReads++;
			throw new Error('not requested');
		}
		get signal(): AbortSignal {
			throw new Error('request signal must shadow this getter');
		}
	}
	const configuration = Object.freeze(new Configuration());
	const opened = await openExactRequestScope({ method: 'POST' }, configuration);
	onTestFinished(() => opened.dispose());
	expect(unrelatedReads).toBe(0);
	expect(await opened.context.authorize?.({ method: 'POST' }, opened.context)).toBe(true);
	expect(opened.context.signal).toBeDefined();
	expect(Object.hasOwn(configuration, 'signal')).toBe(false);
});

it('captures own enumerable policy getters once', async ({ onTestFinished }) => {
	const runtime = createExactContextRuntime();
	onTestFinished(() => runtime.dispose());
	const configuration = context({ contextRuntime: runtime });
	let reads = 0;
	Object.defineProperty(configuration, 'authorize', {
		enumerable: true,
		get() {
			reads++;
			return () => true;
		}
	});
	const opened = await openExactRequestScope({ method: 'POST' }, configuration);
	onTestFinished(() => opened.dispose());
	expect(reads).toBe(1);
	expect(await opened.context.authorize?.({ method: 'POST' }, opened.context)).toBe(true);
	expect(reads).toBe(1);
});

it.each([new Error('configuration capture'), undefined])(
	'releases opened resources after configuration capture throws %j',
	async (primary) => {
		const runtime = createExactContextRuntime();
		onTestFinished(() => runtime.dispose());
		const open = runtime.open;
		let disposed = 0;
		runtime.open = async (...args) => {
			const opened = await Reflect.apply(open, runtime, args);
			return {
				...opened,
				async dispose(reason?: unknown) {
					disposed++;
					await opened.dispose(reason);
					if (disposed === 1) throw new Error('secondary disposal failure');
				}
			};
		};
		const configuration = context({ contextRuntime: runtime });
		Object.defineProperty(configuration, 'captureFailure', {
			enumerable: true,
			configurable: true,
			get() {
				throw primary;
			}
		});
		await expect(openExactRequestScope({ method: 'POST' }, configuration)).rejects.toBe(primary);
		expect(disposed).toBe(1);
		Reflect.deleteProperty(configuration, 'captureFailure');
		const next = await openExactRequestScope({ method: 'POST' }, configuration);
		await next.dispose();
		expect(disposed).toBe(2);
	}
);

it('defines request overrides locally without invoking a provider Proxy setter', async ({
	onTestFinished
}) => {
	const runtime = createExactContextRuntime();
	onTestFinished(() => runtime.dispose());
	let writes = 0;
	const configuration = new Proxy(context({ contextRuntime: runtime }), {
		set(target, key, value) {
			writes++;
			return Reflect.set(target, key, value);
		}
	});
	const opened = await openExactRequestScope({ method: 'POST' }, configuration);
	onTestFinished(() => opened.dispose());
	expect(opened.context.signal).toBeDefined();
	expect(writes).toBe(0);
	expect(configuration.signal).toBeUndefined();
});
