import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it, onTestFinished } from 'vitest';
import {
	reactiveProvenanceRoot,
	ReactiveScalarPropParent,
	scalarPropGetterReads
} from './test-support/reactive-provenance.fixtures.js';
import {
	reactiveProvenanceRoot as serverRoot,
	ReactiveScalarPropParent as ServerScalarPropParent,
	scalarPropGetterReads as serverGetterReads
} from './test-support/reactive-provenance.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	it(`preserves lexical snapshots and live helper captures through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const output = await renderToHydratableString(serverRoot());
			host.innerHTML = output.html;
			const initial = host.querySelector('output');
			hydrate(reactiveProvenanceRoot(), host, {
				resumptions: output.resumptions,
				onMismatch: 'throw',
				onErrorReport: (report) => reports.push(report)
			});
			expect(host.querySelector('output')).toBe(initial);
		} else render(reactiveProvenanceRoot(), host, { onErrorReport: (r) => reports.push(r) });
		const output = host.querySelector('output')!;
		const mapped = host.querySelector('[data-callback-map]')!;
		expect(mapped.textContent).toBe('1');
		const buttons = host.querySelectorAll('button');
		expect(output.textContent).toBe('1:1:2:1:11:10:11');
		for (const value of [2, 3]) {
			buttons[0].click();
			flushSync();
			expect(output.textContent).toBe(`1:1:${value * 2}:${value}:11:10:11`);
			expect(host.querySelector('output')).toBe(output);
			expect(mapped.textContent).toBe(String(value));
			expect(host.querySelector('[data-callback-map]')).toBe(mapped);
		}
		buttons[1].click();
		flushSync();
		expect(output.textContent).toBe('1:1:6:3:23:20:23');
		expect(host.querySelector('button')).toBe(buttons[0]);
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});

it('hydrates chained reactive values in place and updates them from a parent prop', async () => {
	const host = document.createElement('div');
	onTestFinished(() => {
		dispose(host, true);
	});
	const serverBefore = serverGetterReads();
	const ssr = await renderToHydratableString(receipt(ServerScalarPropParent as never, {}));
	expect(serverGetterReads() - serverBefore).toBe(1);
	host.innerHTML = ssr.html;
	const output = host.querySelector('output')!;
	expect(output.textContent).toBe('41');

	const clientBefore = scalarPropGetterReads();
	const view = hydrate(receipt(ReactiveScalarPropParent as never, {}), host, {
		resumptions: ssr.resumptions,
		onMismatch: 'throw'
	});
	await view.whenSettled();
	expect(host.querySelector('output')).toBe(output);
	expect(output.textContent).toBe('41');
	expect(scalarPropGetterReads() - clientBefore).toBe(1);

	host.querySelector('button')!.click();
	flushSync();
	expect(host.querySelector('output')).toBe(output);
	expect(output.textContent).toBe('42');
	expect(scalarPropGetterReads() - clientBefore).toBe(2);
});
