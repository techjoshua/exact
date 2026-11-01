import { expect, it } from 'vitest';
import { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '@exactjs/core';
import { defineExactOperationContract, handleExactRequest } from './index.js';
import { mergeStateForContract } from '../../hydrate/src/state.js';
import { context, noopLogger } from './test-support/server.js';

it.each([undefined, NaN, Infinity, -Infinity, -0, null, 'after'])(
	'publishes an authorized server assignment through HTTP (%s)',
	async (value) => {
		const contract = defineExactOperationContract('clear', {
			reads: [{ path: 'input', kind: 'read', confidence: 'exact' }],
			writes: [{ path: 'label', kind: 'write', confidence: 'exact' }]
		});
		const response = await handleExactRequest(
			{
				method: 'POST',
				url: 'http://exact.test/__exact',
				headers: { origin: 'http://exact.test', 'content-type': 'application/json' },
				body: JSON.stringify(
					encodeReactiveProtocolValue({
						type: 'invoke',
						id: 'clear',
						payload: { dependencies: [] },
						state: { input: value }
					})
				)
			},
			{
				contract: {
					version: 1,
					invocations: { clear: contract },
					executors: {
						clear: {
							id: contract.id,
							componentId: contract.componentId,
							execute(activation) {
								expect(Object.hasOwn(activation.state, 'input')).toBe(true);
								expect(Object.is(activation.state.input, value)).toBe(true);
								activation.state.label = value;
								return { state: activation.state };
							}
						}
					},
					boundaries: {}
				},
				invocations: {},
				logger: noopLogger
			}
		);
		expect(response.status).toBe(200);
		if (typeof response.body !== 'string') throw new Error('Expected buffered response');
		const decoded = decodeReactiveProtocolValue(JSON.parse(response.body)) as {
			state: { label: unknown };
		};
		expect(Object.hasOwn(decoded.state, 'label')).toBe(true);
		expect(Object.is(decoded.state.label, value)).toBe(true);
		expect(
			mergeStateForContract({ label: 'before', sibling: 'keep' }, decoded.state, {
				writes: contract.stateWrites
			})
		).toEqual({ ok: true, state: { label: value, sibling: 'keep' } });
	}
);

it.each(['state', 'prop'] as const)(
	'publishes an owned undefined %s patch while rejecting a missing value',
	async (type) => {
		const base = context();
		for (const present of [true, false]) {
			const patch = {
				type,
				id: 'panel',
				...(type === 'prop' ? { name: 'title' } : {}),
				...(present ? { value: undefined } : {})
			};
			const response = await handleExactRequest(
				{ method: 'POST', body: { type: 'invoke', id: 'allowed-action' } },
				{
					...base,
					contract: {
						...base.contract,
						invocations: {
							'allowed-action': defineExactOperationContract('allowed-action', {
								boundaries: ['panel']
							})
						}
					},
					invocations: { 'allowed-action': () => ({ patches: [patch] }) } as typeof base.invocations
				}
			);
			expect(response.status).toBe(present ? 200 : 500);
			if (present) {
				if (typeof response.body !== 'string') throw new Error('Expected buffered response');
				const decoded = decodeReactiveProtocolValue(JSON.parse(response.body)) as {
					patches: Array<{ value: unknown }>;
				};
				expect(Object.hasOwn(decoded.patches[0]!, 'value')).toBe(true);
				expect(decoded.patches[0]!.value).toBeUndefined();
			}
		}
	}
);
