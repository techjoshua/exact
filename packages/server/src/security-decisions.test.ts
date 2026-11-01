import { verifyServerSecurity } from '../../component-composition-corpus/test-support/server-security-journey.mjs';
import { describe, expect, it, vi } from 'vitest';
import {
	createExactServerDebugRuntime,
	defineExactOperationContract,
	createExactContextRuntime,
	openExactRequestScope,
	handleExactRequest,
	type ExactServerContext
} from './index.js';
import { context } from './test-support/server.js';

const hooks = ['authorize', 'validateCsrf', 'authorizeOperation'] as const;
const invocation = { type: 'invoke', id: 'allowed-action' };

describe('server boolean security decisions', () => {
	it.each(hooks)('requires true from %s, including asynchronous results', async (hook) => {
		for (const asynchronous of [false, true]) {
			for (const decision of [false, null, undefined, 0, 1, '', 'true', {}, { allowed: false }]) {
				const action = vi.fn(() => ({ value: 42 }));
				const callback = () =>
					asynchronous ? Promise.resolve(decision as boolean) : (decision as boolean);
				const response = await handleExactRequest(
					{ method: 'POST', body: invocation },
					context({ invocations: { 'allowed-action': action }, [hook]: callback })
				);
				expect(response.status).toBe(403);
				expect(action).not.toHaveBeenCalled();
			}
		}
	});

	it.each(hooks)('fails closed for malformed configured %s hooks', async (hook) => {
		for (const invalid of [null, false, 0, '']) {
			const action = vi.fn(() => ({ value: 42 }));
			const response = await handleExactRequest(
				{ method: 'POST', body: invocation },
				context({
					invocations: { 'allowed-action': action },
					[hook]: invalid as unknown as NonNullable<ExactServerContext[typeof hook]>
				})
			);
			expect(response.status).toBe(403);
			expect(action).not.toHaveBeenCalled();
		}
	});

	it.each(hooks)('preserves approved %s method receivers and ordinary omission', async (hook) => {
		let calls = 0;
		const policy = function (this: ExactServerContext, ...args: unknown[]) {
			calls++;
			expect(this).toBe(args.at(-1));
			return Promise.resolve(true);
		};
		const action = vi.fn(() => ({ value: 42 }));
		const approved = await handleExactRequest(
			{ method: 'POST', body: invocation },
			context({ invocations: { 'allowed-action': action }, [hook]: policy })
		);
		expect(approved.status).toBe(200);
		expect(calls).toBe(1);
		expect(action).toHaveBeenCalledOnce();
		const omitted = await handleExactRequest(
			{ method: 'POST', body: invocation },
			context({ invocations: { 'allowed-action': action }, [hook]: undefined })
		);
		expect(omitted.status).toBe(200);
	});

	it.each(['authorize', 'validateCsrf'] as const)(
		'rejects malformed %s approval before body access',
		async (hook) => {
			let reads = 0;
			const response = await handleExactRequest(
				{
					method: 'POST',
					get body() {
						reads++;
						return invocation;
					}
				},
				context({ [hook]: () => ({ allowed: false }) as unknown as boolean })
			);
			expect(response.status).toBe(403);
			expect(reads).toBe(0);
		}
	);

	it.each(hooks)(
		'retains inherited and nonenumerable %s policies with their owner',
		async (hook) => {
			for (const allowed of [true, false]) {
				class PolicyContext {
					#allowed = allowed;
					calls = 0;
					contract = context().contract;
					invocations = { 'allowed-action': vi.fn(() => ({ value: 42 })) };
					logger = context().logger;
					[hook]() {
						this.calls++;
						return this.#allowed;
					}
				}
				const method = Reflect.get(PolicyContext.prototype, hook);
				Object.defineProperty(method, 'name', {
					configurable: true,
					get() {
						throw new Error('method metadata');
					}
				});
				const configuration = new PolicyContext();
				const response = await handleExactRequest(
					{ method: 'POST', body: invocation },
					configuration
				);
				expect(response.status).toBe(allowed ? 200 : 403);
				expect(configuration.calls).toBe(1);
				expect(configuration.invocations['allowed-action'].mock.calls).toHaveLength(
					allowed ? 1 : 0
				);
				const hidden = context({ invocations: { 'allowed-action': vi.fn(() => ({ value: 42 })) } });
				Object.defineProperty(hidden, hook, { value: () => allowed, enumerable: false });
				expect(
					(await handleExactRequest({ method: 'POST', body: invocation }, hidden)).status
				).toBe(allowed ? 200 : 403);
			}
		}
	);

	it('requires true from debug policies and preserves boolean configuration', async () => {
		for (const decision of [false, null, undefined, 0, 1, '', 'true', {}, { allowed: false }]) {
			const runtime = createExactServerDebugRuntime(
				context({ allowDebug: async () => decision as boolean })
			);
			try {
				const response = await runtime.handle(
					{
						method: 'POST',
						url: 'https://app.test/__exact',
						headers: { origin: 'https://app.test' }
					},
					{ type: 'debug', version: 1, request: 'open' }
				);
				expect(response.status).toBe(404);
			} finally {
				await runtime.close();
			}
		}
	});
});

it.each(hooks)('retains virtual Proxy %s policies outside own-key enumeration', async (hook) => {
	const action = vi.fn(() => ({ value: 42 }));
	const configuration = new Proxy(context({ invocations: { 'allowed-action': action } }), {
		get(target, key, receiver) {
			return key === hook ? () => false : Reflect.get(target, key, receiver);
		}
	});
	const response = await handleExactRequest({ method: 'POST', body: invocation }, configuration);
	expect(response.status).toBe(403);
	expect(action).not.toHaveBeenCalled();
});

it('checks the shared native server security journey', async () => {
	expect(
		await verifyServerSecurity({
			handleExactRequest,
			defineExactOperationContract,
			createExactServerDebugRuntime,
			createExactContextRuntime,
			openExactRequestScope
		})
	).toBe(true);
});
