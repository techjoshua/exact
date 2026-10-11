import { expect, it, onTestFinished } from 'vitest';
import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import {
	ComputedComponentMembers,
	ComputedRefMembers,
	ComputedReactiveMembers,
	OrdinaryReceiverMembers,
	computedMemberTrace,
	resetComputedMemberTrace
} from './test-support/computed-component-members.fixtures.js';
import {
	ComputedComponentMembers as ServerMembers,
	ComputedRefMembers as ServerRefs,
	ComputedReactiveMembers as ServerReactive,
	OrdinaryReceiverMembers as ServerOrdinary,
	computedMemberTrace as serverTrace,
	resetComputedMemberTrace as resetServerTrace
} from './test-support/computed-component-members.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'preserves computed member ownership through %s, retained updates, and disposal',
	async (mode) => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		resetComputedMemberTrace();
		resetServerTrace();
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerMembers, {}));
			expect(serverTrace().slice(0, 3)).toEqual(['key', 'created', 'mount-key']);
			expect(serverTrace().slice(3).sort()).toEqual(['disposed', 'unmounted']);
			host.innerHTML = result.html;
			const original = host.querySelector('output');
			hydrate(receipt(ComputedComponentMembers, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report)
			});
			expect(host.querySelector('output')).toBe(original);
		} else
			render(receipt(ComputedComponentMembers, {}), host, {
				onErrorReport: (report) => reports.push(report)
			});
		expect(computedMemberTrace()).toEqual(['key', 'created', 'mount-key', 'mounted']);
		const output = host.querySelector('output');
		for (const expected of ['1', '2']) {
			host.querySelector('button')!.click();
			flushSync();
			expect(output?.textContent).toBe(expected);
			expect(host.querySelector('output')).toBe(output);
			expect(computedMemberTrace()).toEqual(['key', 'created', 'mount-key', 'mounted']);
		}
		dispose(host, true);
		expect(computedMemberTrace().slice(0, 4)).toEqual(['key', 'created', 'mount-key', 'mounted']);
		expect(computedMemberTrace().slice(4).sort()).toEqual(['disposed', 'unmounted']);
		dispose(host, true);
		expect(computedMemberTrace().filter((value) => value === 'disposed')).toHaveLength(1);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	}
);

for (const [name, Client, Server, initial] of [
	['ref', ComputedRefMembers, ServerRefs, 0],
	['reactive', ComputedReactiveMembers, ServerReactive, 1],
	['ordinary', OrdinaryReceiverMembers, ServerOrdinary, 14]
] as const)
	it.each(['mount', 'hydrate'] as const)(
		`retains computed ${name} members through %s`,
		async (mode) => {
			const host = document.createElement('div');
			const reports: unknown[] = [];
			onTestFinished(() => {
				dispose(host, true);
			});
			resetComputedMemberTrace();
			if (mode === 'hydrate') {
				const result = await renderToHydratableString(receipt(Server, {}));
				host.innerHTML = result.html;
				const original = host.querySelector('output');
				hydrate(receipt(Client, {}), host, {
					resumptions: result.resumptions,
					onMismatch: 'throw',
					onErrorReport: (report) => reports.push(report)
				});
				expect(host.querySelector('output')).toBe(original);
			} else render(receipt(Client, {}), host, { onErrorReport: (report) => reports.push(report) });
			flushSync();
			const output = host.querySelector('output');
			expect(output?.textContent).toBe(String(initial));
			for (const next of [initial + 1, initial + 2]) {
				host.querySelector('button')!.click();
				flushSync();
				expect(output?.textContent).toBe(String(next));
				expect(host.querySelector('output')).toBe(output);
			}
			if (name === 'ref') expect(computedMemberTrace()).toEqual(['ref-ready']);
			dispose(host, true);
			expect(host.childNodes).toHaveLength(0);
			expect(reports).toEqual([]);
		}
	);
