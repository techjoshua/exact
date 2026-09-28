/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { render } from '@exactjs/dom';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import { createExactServerRuntime } from '@exactjs/ssr';
import { createExactClient } from '@exactjs/hydrate';
import { ResultOwner as Client } from './test-support/awaited-task-result.fixtures.test.js';
import { ResultOwner as Server } from './test-support/awaited-task-result.fixtures.test.js?exact-target=server';

it('keeps awaited result assignments with each invoking event', async () => {
	const contract = composeExactExecutorContract([Server]);
	const runtime = createExactServerRuntime({ contract });
	const container = document.createElement('div');
	const errors: unknown[] = [];
	const client = createExactClient(container, {
		endpoint: '/result',
		batch: false,
		continuations: composeExactComponentContracts([Client], 'client').continuations,
		onErrorReport: (report) => errors.push(report),
		onDiagnostic: (diagnostic) => errors.push(diagnostic),
		logger: {
			isEnabled: (level) => level === 'warn' || level === 'error',
			log: (report) => errors.push(report)
		},
		fetch: async (_url, init) =>
			exactResponseToFetchResponse(
				await handleExactRequest(
					{
						url: 'http://test/result',
						method: init.method,
						headers: init.headers,
						body: JSON.parse(init.body),
						signal: init.signal
					},
					runtime
				)
			)
	});
	try {
		// Returning a value grants no authority to write a caller-selected destination.
		expect(Object.values(contract.invocations).map((invocation) => invocation.stateWrites)).toEqual(
			[[]]
		);
		render(receipt(Client, {}), container, {
			componentDomain: client.domain,
			onErrorReport: (report) => errors.push(report)
		});
		(container.querySelector('[data-left]') as HTMLButtonElement).click();
		await vi.waitFor(() =>
			expect(container.querySelector('[data-left-value]')?.textContent).toBe('first')
		);
		(container.querySelector('[data-right]') as HTMLButtonElement).click();
		await vi.waitFor(() =>
			expect(container.querySelector('[data-right-value]')?.textContent).toBe('second')
		);
		expect(container.querySelector('[data-left-value]')?.textContent).toBe('first');
		expect(errors).toEqual([]);
	} finally {
		client.dispose();
		await runtime.dispose?.();
	}
});
