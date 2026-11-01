/** @vitest-environment jsdom */
import { it, expect, onTestFinished } from 'vitest';
import { unwrap, flushSync } from '@exactjs/reactive';
import { createExactClient, defineExactHydrationRegistration } from '@exactjs/hydrate';
import {
	composeExactComponentContracts,
	type AnyExactComponentCallable
} from '@exactjs/core/framework/component-contracts';
import {
	composeExactExecutorContract,
	handleExactRequest,
	exactResponseToFetchResponse
} from '@exactjs/server';
import { mounted, modules } from '../test-support/array-completion-fixture.js';
it.each([
	'UnionPushDirect',
	'UnionPushHelper',
	'UnionReverseDirect',
	'UnionReverseHelper',
	'TuplePush'
])('publishes admitted Array/tuple union native mutation: %s', async (name) => {
	const f = await mounted('unions', undefined, undefined, undefined, name);
	f.click();
	await f.client.whenSettled();
	flushSync();
	expect(f.state.rows).toEqual(name.includes('Reverse') ? [2, 1] : [1, 2]);
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(f.reports).toEqual([]);
	const result = JSON.parse((f.responses[0] as { body: string }).body);
	expect(result.arrayCompletion).toBe(4);
	expect(result.mutations).toMatchObject([{ operation: 'array-net', path: 'rows' }]);
	f.click();
	await f.client.whenSettled();
	flushSync();
	expect(f.state.rows).toEqual(name.includes('Reverse') ? [1, 2] : [1, 2, 2]);
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(f.reports).toEqual([]);
	expect(f.client.pendingRequests).toBe(0);
	expect(f.reports).toEqual([]);
});
function rootClient(binding = true, hold = false, late = false) {
	const mod = modules.get('member-only')!,
		names = ['RootDirect', 'MemberDirect'];
	const clients = names.map((n) => mod.client[n] as AnyExactComponentCallable),
		servers = names.map((n) => mod.server[n] as AnyExactComponentCallable);
	clients.push(modules.get('unions')!.client.Scalar as AnyExactComponentCallable);
	servers.push(modules.get('unions')!.server.Scalar as AnyExactComponentCallable);
	const registration = composeExactComponentContracts(clients, 'client');
	const duplicate = composeExactComponentContracts([...clients, ...clients], 'client');
	expect(Object.keys(duplicate.continuationArrays)).toEqual(
		Object.keys(registration.continuationArrays)
	);
	expect(Object.keys(registration.continuationArrays)).toHaveLength(2);
	const contract = composeExactExecutorContract(servers),
		container = document.createElement('main');
	document.body.append(container);
	const state = { rows: [{ label: 'A' }, { label: 'B' }] },
		requests: unknown[] = [],
		responses: unknown[] = [],
		reports: unknown[] = [],
		diagnostics: { code: string }[] = [],
		gates: (() => void)[] = [];
	const client = createExactClient(container, {
		continuations: late ? undefined : registration.continuations,
		continuationArrays: binding && !late ? registration.continuationArrays : undefined,
		state,
		endpoint: '/__exact',
		batch: false,
		onErrorReport: (report) => {
			reports.push(report);
		},
		onDiagnostic: (diagnostic) => {
			diagnostics.push(diagnostic);
		},
		fetch: async (_url, init) => {
			const body = JSON.parse(init.body);
			requests.push(body);
			const raw = await handleExactRequest(
				{
					method: 'POST',
					url: 'http://exact.local/__exact',
					headers: { 'content-type': 'application/json' },
					body: init.body
				},
				{ contract, invocations: {} }
			);
			const response = exactResponseToFetchResponse(raw);
			responses.push(await response.clone().json());
			if (hold) await new Promise<void>((resolve) => gates.push(resolve));
			return response;
		}
	});
	if (late) {
		const input = defineExactHydrationRegistration({
			continuations: registration.continuations,
			continuationArrays: binding ? registration.continuationArrays : undefined
		});
		client.registerComponents(input);
		client.registerComponents(input);
	}
	onTestFinished(async () => {
		for (const release of gates) release();
		client.dispose();
		container.remove();
		const before = requests.length;
		await expect(
			client.invokeTask(Object.keys(registration.continuations)[0]!, { dependencies: [] })
		).rejects.toThrow('disposed');
		expect(requests).toHaveLength(before);
		expect(container.isConnected).toBe(false);
	});
	const id = (name: string) =>
		Object.keys(registration.continuations).find(
			(id) =>
				registration.continuations[id]!.componentId ===
				composeExactComponentContracts([mod.client[name] as AnyExactComponentCallable], 'client')
					.continuations[id]?.componentId
		)!;
	return { client, state, requests, responses, gates, id, reports, diagnostics, registration };
}
it.each([false, true])(
	'preserves explicit root state invokeTask with generated registration, late=%s',
	async (late) => {
		const f = rootClient(true, false, late),
			rows = f.state.rows,
			a = rows[0],
			b = rows[1];
		await f.client.invokeTask(f.id('RootDirect'), { dependencies: [] });
		expect(f.client.state).toBe(f.state);
		expect(f.state.rows).toBe(rows);
		expect(rows).toEqual([{ label: 'A' }, { label: 'B' }, { label: 'added' }]);
		expect(rows[0]).toBe(a);
		expect(rows[1]).toBe(b);
		await f.client.invokeTask(f.id('MemberDirect'), { dependencies: [] });
		expect(rows[0]).toBe(a);
		expect(a!.label).toBe('changed');
		expect(rows[1]).toBe(b);
		expect(f.diagnostics).toEqual([]);
		expect(f.requests).toMatchObject([
			{ arrayCompletion: 4, payload: { dependencies: [] } },
			{ arrayCompletion: 4, payload: { dependencies: [] } }
		]);
		expect(f.client.pendingRequests).toBe(0);
		expect(f.reports).toEqual([]);
	}
);
it.each([false, true])(
	'rejects explicit Array root invocation without an admitted executable, late=%s',
	async (late) => {
		const f = rootClient(false, false, late);
		await expect(f.client.invokeTask(f.id('RootDirect'), { dependencies: [] })).rejects.toThrow(
			'Missing admitted Array client binding'
		);
		expect(f.requests).toEqual([]);
		expect(f.state.rows).toEqual([{ label: 'A' }, { label: 'B' }]);
		expect(f.client.pendingRequests).toBe(0);
		expect(f.reports).toEqual([]);
	}
);
it('retains existing explicit root request ordering for reversed responses', async () => {
	const f = rootClient(true, true),
		rows = f.state.rows;
	const first = f.client.invokeTask(f.id('RootDirect'), { dependencies: [] });
	await expect.poll(() => f.gates.length).toBe(1);
	const second = f.client.invokeTask(f.id('RootDirect'), { dependencies: [] });
	await expect.poll(() => f.gates.length).toBe(2);
	f.gates[1]!();
	await second;
	f.gates[0]!();
	await first;
	expect(f.state.rows).toBe(rows);
	expect(rows).toHaveLength(3);
	expect(f.client.pendingRequests).toBe(0);
	expect(f.reports).toEqual([]);
});

it.each(['capture', 'parse', 'plan', 'apply'] as const)(
	'rejects conflicting late %s callbacks without replacing admitted root publication',
	async (key) => {
		const f = rootClient(true, false, true),
			id = f.id('RootDirect');
		const binding = f.registration.continuationArrays[id]!;
		expect(() =>
			f.client.registerComponents({
				continuationArrays: { [id]: { ...binding, [key]: () => {} } }
			})
		).toThrow('Conflicting');
		expect(f.requests).toEqual([]);
		const rows = f.state.rows,
			a = rows[0],
			b = rows[1];
		await f.client.invokeTask(id, { dependencies: [] });
		expect(f.client.state).toBe(f.state);
		expect(f.state.rows).toBe(rows);
		expect(rows).toEqual([{ label: 'A' }, { label: 'B' }, { label: 'added' }]);
		expect(rows[0]).toBe(a);
		expect(rows[1]).toBe(b);
		expect(f.responses).toMatchObject([
			{ arrayCompletion: 4, mutations: [{ operation: 'array-net', path: 'rows' }] }
		]);
		expect(f.client.pendingRequests).toBe(0);
		expect(f.reports).toEqual([]);
	}
);
