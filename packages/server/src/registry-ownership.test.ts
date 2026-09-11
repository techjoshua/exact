import { describe, expect, it, vi } from 'vitest';
import {
	composeExactExecutorContract,
	defineExactOperationContract,
	handleExactRequest
} from './index.js';
import { context } from './test-support/server.js';

describe('server registry ownership', () => {
	it('preserves explicit prototype-shaped endpoint names without inherited entries', () => {
		const invocations = Object.assign(Object.create({ inherited: '/private' }), {
			toString: '/explicit'
		});
		Object.defineProperty(invocations, '__proto__', { value: '/proto', enumerable: true });
		const contract = composeExactExecutorContract([], { endpoints: { invocations } });
		expect(contract.endpoints?.invocations).toEqual({
			toString: '/explicit',
			['__proto__']: '/proto'
		});
		expect(Object.getPrototypeOf(contract.endpoints?.invocations)).toBe(Object.prototype);
	});
	it('does not authorize inherited invocation entries', async () => {
		const run = vi.fn(() => ({ value: 'private' }));
		const base = context();
		base.contract = {
			...base.contract,
			invocations: Object.create({ inherited: defineExactOperationContract('inherited') })
		};
		base.invocations = { inherited: run };
		const response = await handleExactRequest(
			{ method: 'POST', body: { type: 'invoke', id: 'inherited' } },
			base
		);
		expect(response.status).toBe(404);
		expect(run).not.toHaveBeenCalled();
	});
	it('does not execute inherited handlers for an explicitly allowed operation', async () => {
		const run = vi.fn(() => ({ value: 'private' }));
		const base = context({ invocations: Object.create({ 'allowed-action': run }) });
		const response = await handleExactRequest(
			{ method: 'POST', body: { type: 'invoke', id: 'allowed-action' } },
			base
		);
		expect(response.status).toBe(404);
		expect(run).not.toHaveBeenCalled();
	});

	it('requires an own payload decoder even when one exists on the prototype', async () => {
		const run = vi.fn(() => ({ value: 'private' }));
		const base = context({
			invocations: { 'allowed-action': run },
			payloadDecoders: {
				invocations: Object.create({ 'allowed-action': (value: unknown) => value })
			}
		});
		const response = await handleExactRequest(
			{ method: 'POST', body: { type: 'invoke', id: 'allowed-action', payload: {} } },
			base
		);
		expect(response.status).toBe(400);
		expect(run).not.toHaveBeenCalled();
	});

	it.each(['toString', '__proto__'])(
		'allows explicitly registered prototype-shaped name %s',
		async (id) => {
			const run = vi.fn(() => ({ value: 'registered' }));
			const contract = composeExactExecutorContract([], {
				invocations: { [id]: defineExactOperationContract(id) }
			});
			const response = await handleExactRequest(
				{ method: 'POST', body: { type: 'invoke', id } },
				context({ contract, invocations: { [id]: run } })
			);
			expect(response.status).toBe(200);
			expect(run).toHaveBeenCalledOnce();
			expect(Object.getPrototypeOf(contract.invocations)).toBe(Object.prototype);
		}
	);
});
