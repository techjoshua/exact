import { expect, it, onTestFinished, vi } from 'vitest';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import {
	composeExactExecutorContract,
	exactResponseToFetchResponse,
	handleExactRequest
} from '@exactjs/server';
import {
	NormalizationAsyncInputProbe,
	NormalizationServerSnapshotProbe
} from './test-support/source-normalization-server.fixtures.js';
import {
	NormalizationAsyncInputProbe as ServerAsyncInput,
	NormalizationServerSnapshotProbe as ServerSnapshot
} from './test-support/source-normalization-server.fixtures.js?exact-target=server';

for (const [kind, Client, Server] of [
	['async', NormalizationAsyncInputProbe, ServerAsyncInput],
	['snapshot', NormalizationServerSnapshotProbe, ServerSnapshot]
] as const)
	it(`retains ${kind} server setup activation after hydration`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		const requests: unknown[] = [];
		const continuations = composeExactComponentContracts([Client], 'client').continuations;
		const server = {
			contract: composeExactExecutorContract([Server], { endpoint: '/normalization' }),
			invocations: {}
		};
		const result = await renderToHydratableString(receipt(Server, {}), {
			endpoint: '/normalization',
			buildKey: 'normalization',
			continuations
		});
		host.innerHTML = result.htmlWithHydration;
		const output = host.querySelector('output');
		const client = hydrate(receipt(Client, {}), host, {
			endpoint: '/normalization',
			buildKey: 'normalization',
			batch: false,
			continuations,
			onMismatch: 'throw',
			onErrorReport: (r) => reports.push(r),
			logger: {
				log: (r) => {
					if (r.error !== undefined) reports.push(r);
				}
			},
			fetch: async (url, init) => {
				const body = JSON.parse(init.body);
				requests.push(body);
				return exactResponseToFetchResponse(
					await handleExactRequest(
						{ url, method: init.method, headers: init.headers, body, signal: init.signal },
						server
					)
				);
			}
		});
		onTestFinished(() => client.dispose());
		await client.whenSettled();
		expect(requests).toEqual([]);
		for (const expected of ['2', '4', '6']) {
			await vi.waitFor(() => expect(host.querySelector('output')?.textContent).toBe(expected));
			expect(host.querySelector('output')).toBe(output);
			if (kind === 'snapshot') {
				host.querySelector<HTMLButtonElement>('#normalization-server-snapshot-change')!.click();
				await client.whenSettled();
				expect(output?.textContent).toBe(expected);
			}
			if (expected !== '6')
				host
					.querySelector<HTMLButtonElement>(
						kind === 'async'
							? '#normalization-async-input-next'
							: '#normalization-server-snapshot-next'
					)!
					.click();
		}
		expect(requests).toHaveLength(2);
		client.dispose();
		expect(host.querySelector('section')).toBeNull();
		expect(reports).toEqual([]);
	});
