// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { taskMutation } from '../../core/src/runtime/tasks.js';
import { deleteReactiveValue, writeReactiveLazy } from '../../core/src/runtime/reactivity.js';
import {
	defineExactOperationContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '../../server/src/index.js';
import { createExactClient } from './index.js';
import { testContinuation, noopLogger } from './test-support/responses.js';

const modes = [
	'delete',
	'skip',
	'undefined',
	'skip-read',
	'assign-read',
	'child-read',
	'parent-read'
] as const;
it.each(
	modes.flatMap((mode) =>
		[false, true].flatMap((batch) => [false, true].map((stream) => ({ mode, batch, stream })))
	)
)(
	'publishes performed $mode changes without replaying captured inputs (batch=$batch, stream=$stream)',
	async ({ mode, batch, stream }) => {
		const nested = mode === 'child-read' || mode === 'parent-read';
		const writes = nested
			? ([
					{ path: 'nested', kind: 'write', confidence: 'exact' },
					{ path: 'nested.value', kind: 'write', confidence: 'exact' }
				] as const)
			: ([{ path: 'label', kind: 'write', confidence: 'exact' }] as const);
		const reads = mode.endsWith('-read')
			? ([{ path: nested ? 'nested.value' : 'label', kind: 'read', confidence: 'exact' }] as const)
			: [];
		const contract = defineExactOperationContract('clear', { reads, writes });
		const requests: { type: string; operations?: unknown[] }[] = [];
		const client = createExactClient(document.createElement('main'), {
			endpoint: '/__exact',
			batch,
			stream,
			state: { label: 'before', sibling: 'keep', nested: { value: 'before', sibling: 'keep' } },
			continuations: { clear: testContinuation('clear', { reads, writes }) },
			fetch: async (_url, init) => {
				requests.push(JSON.parse(String(init?.body)));
				const response = exactResponseToFetchResponse(
					await handleExactRequest(
						{ method: 'POST', headers: new Headers(init?.headers), body: init?.body },
						{
							contract: {
								version: 1,
								invocations: { clear: contract },
								boundaries: {},
								executors: {
									clear: {
										id: contract.id,
										componentId: contract.componentId,
										execute(activation, execution) {
											if (mode === 'delete')
												taskMutation(execution.signal, () =>
													deleteReactiveValue(activation.state, ['label'])
												);
											else if (mode === 'undefined')
												taskMutation(execution.signal, () =>
													writeReactiveLazy(activation.state, ['label'], () => undefined)
												);
											else if (mode === 'assign-read')
												taskMutation(execution.signal, () =>
													writeReactiveLazy(
														activation.state,
														['label'],
														() => activation.state.label
													)
												);
											else if (nested)
												taskMutation(execution.signal, () =>
													writeReactiveLazy(
														activation.state,
														mode === 'child-read' ? ['nested', 'value'] : ['nested'],
														() => (mode === 'child-read' ? 'after' : { value: 'after' })
													)
												);
											return { state: activation.state };
										}
									}
								}
							},
							invocations: {},
							logger: noopLogger
						}
					)
				);
				// A local edit after execution must survive a branch that performed no write.
				if (mode.endsWith('-read') && !nested)
					(client.state as { label: string }).label = 'local update';
				return response;
			}
		});
		try {
			await Promise.all([
				client.invokeTask('clear', { dependencies: [] }),
				client.invokeTask('clear', { dependencies: [] })
			]);
			expect(requests.length).toBe(batch ? 1 : 2);
			if (batch) expect(requests[0]!.operations?.length).toBe(2);
			const state = client.state as {
				label?: unknown;
				sibling: string;
				nested: { value: string; sibling?: string };
			};
			expect(Object.hasOwn(state, 'label')).toBe(mode !== 'delete');
			expect(state.label).toBe(
				mode === 'skip-read'
					? 'local update'
					: mode === 'skip' || mode === 'assign-read' || nested
						? 'before'
						: undefined
			);
			expect(state.sibling).toBe('keep');
			if (nested) {
				expect(state.nested.value).toBe('after');
				expect(state.nested.sibling).toBe(mode === 'child-read' ? 'keep' : undefined);
			}
		} finally {
			client.dispose();
		}
	}
);

it('lets a subsequent value-only server read observe a deleted optional property as undefined', async () => {
	const contract = defineExactOperationContract('read', {
		reads: [{ path: 'label', kind: 'read', confidence: 'exact' }]
	});
	const client = createExactClient(document.createElement('main'), {
		endpoint: '/__exact',
		state: { sibling: 'keep' },
		continuations: { read: testContinuation('read', { reads: contract.stateReads, writes: [] }) },
		fetch: async (_url, init) =>
			exactResponseToFetchResponse(
				await handleExactRequest(
					{ method: 'POST', headers: { 'content-type': 'application/json' }, body: init?.body },
					{
						contract: {
							version: 1,
							invocations: { read: contract },
							boundaries: {},
							executors: {
								read: {
									id: contract.id,
									componentId: contract.componentId,
									execute(activation) {
										return { state: activation.state, value: activation.state.label };
									}
								}
							}
						},
						invocations: {},
						logger: noopLogger
					}
				)
			)
	});
	try {
		const result = await client.invokeTask('read', { dependencies: [] });
		expect(result.value).toBeUndefined();
		expect(Object.hasOwn(client.state as object, 'label')).toBe(false);
	} finally {
		client.dispose();
	}
});
