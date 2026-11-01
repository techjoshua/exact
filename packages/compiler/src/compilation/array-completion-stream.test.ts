/** @vitest-environment jsdom */
import { it, expect } from 'vitest';
import {
	composeExactComponentContracts,
	type AnyExactComponentCallable
} from '@exactjs/core/framework/component-contracts';
import {
	composeExactExecutorContract,
	handleExactRequest,
	exactResponseToFetchResponse
} from '@exactjs/server';
import type { ExactInvocationRequest } from '@exactjs/core/framework/operation-protocol';
import { captureContinuationSubmission } from '../../../hydrate/src/runtime/array-submission.js';
import { readExactStreamResponse } from '../../../hydrate/src/response/stream.js';
import { enqueueExactOperation } from '../../../hydrate/src/batching.js';
import { modules } from '../test-support/array-completion-fixture.js';

it('retains generated Array completion admission through cancellation-filtered mixed streams', async () => {
	const names = ['RootDirect', 'Scalar', 'RootHelper', 'MemberHelper'];
	const select = (name: string, target: 'client' | 'server') =>
		modules.get(name === 'Scalar' ? 'unions' : 'member-only')![target][
			name
		] as AnyExactComponentCallable;
	const clients = names.map((name) => select(name, 'client'));
	const registration = composeExactComponentContracts(clients, 'client');
	const ids = clients.map(
		(page) => Object.keys(composeExactComponentContracts([page], 'client').continuations)[0]!
	);
	const contract = composeExactExecutorContract(names.map((name) => select(name, 'server')));
	const requests: { operations: ExactInvocationRequest[] }[] = [],
		wires: string[] = [],
		reports: unknown[] = [];
	const fetch = async (url: string, init: { body: string; headers?: HeadersInit }) => {
		requests.push(JSON.parse(init.body));
		const result = await handleExactRequest(
			{ method: 'POST', url, headers: init.headers as Record<string, string>, body: init.body },
			{ contract, logger: { log: (report) => reports.push(report) } }
		);
		const response = exactResponseToFetchResponse(result);
		wires.push(await response.clone().text());
		return response;
	};
	const states = [
		{ rows: [{ label: 'A' }, { label: 'B' }] },
		{ value: 0 },
		{ rows: [{ label: 'H' }] },
		{ rows: [{ label: 'M' }] }
	];
	const captures: ReturnType<typeof captureContinuationSubmission>[] = [];
	const host = document.createElement('main');
	document.body.append(host);
	const queue = (index: number, signal?: AbortSignal) => {
		const id = ids[index]!,
			continuation = registration.continuations[id]!,
			binding = registration.continuationArrays[id];
		const state = states[index]!;
		const capture = captureContinuationSubmission(state, continuation, undefined, binding);
		captures.push(capture);
		return enqueueExactOperation(host, {
			endpoint: 'http://fixture/__exact',
			fetch,
			stream: true,
			signal,
			operation: {
				type: 'invoke',
				id,
				payload: { dependencies: [] },
				state: capture.state,
				...(capture.arrayParser ? { arrayCompletion: 4 as const } : {})
			},
			preparedState: capture.preparedState,
			arrayParser: capture.arrayParser
		});
	};
	try {
		const controller = new AbortController();
		const canceled = queue(2, controller.signal);
		const rejected = expect(canceled).rejects.toThrow('pending-cancel');
		controller.abort(new Error('pending-cancel'));
		const settled = await Promise.allSettled(names.map((_, index) => queue(index)));
		const results = settled.map((result) => {
			if (result.status === 'rejected') throw result.reason;
			return result.value;
		});
		await rejected;
		expect(requests).toHaveLength(1);
		expect(requests[0]!.operations.map((operation) => operation.id)).toEqual(ids);
		expect(results.map((result) => result.arrayCompletion)).toEqual([4, undefined, 4, 4]);
		expect(results[0]!.mutations).toMatchObject([
			{ operation: 'array-net', path: 'rows', beforeLength: 2 }
		]);
		expect(results[2]!.mutations).toMatchObject([
			{ operation: 'array-net', path: 'rows', beforeLength: 1 }
		]);
		expect(results[1]!.state).toEqual({ value: 1 });
		expect(results[3]!.state).toEqual({ rows: { 0: { label: 'changed' } } });
		const events = wires[0]!
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line));
		const terminals = events.filter((event) => event.event === 'result');
		expect(
			terminals
				.map((event) => [event.index, event.result.arrayCompletion])
				.sort((a, b) => a[0] - b[0])
		).toEqual([
			[0, 4],
			[1, undefined],
			[2, 4],
			[3, 4]
		]);
		expect(terminals.find((event) => event.index === 1).result).not.toHaveProperty(
			'arrayCompletion'
		);
		expect(
			events
				.filter((event) => event.event === 'mutations')
				.map((event) => event.index)
				.sort()
		).toEqual([0, 2]);
		expect(events.at(-1)).toEqual({ event: 'complete', version: 1 });
		// Corrupt only the actual serialized terminal token, retaining generated identities and parser bindings.
		for (const token of [undefined, 3]) {
			const corrupted = events.map((event) => {
				if (event.event !== 'result' || event.index !== 0) return event;
				const result = { ...event.result };
				if (token === undefined) delete result.arrayCompletion;
				else result.arrayCompletion = token;
				return { ...event, result };
			});
			await expect(
				readExactStreamResponse(
					new Response(corrupted.map((event) => JSON.stringify(event)).join('\n') + '\n'),
					requests[0]!.operations,
					{
						arrayCompletions: ids.map((id) => {
							const binding = registration.continuationArrays[id];
							return binding ? { version: 4 as const, parse: binding.parse } : undefined;
						})
					}
				)
			).rejects.toThrow('malformed');
		}
		expect(reports).toEqual([]);
	} finally {
		for (const capture of captures) capture.release();
		host.remove();
	}
});
