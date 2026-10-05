import { verifyFormBindingControls } from '../test-support/form-binding-journey.mjs';
import { expect, it, onTestFinished } from 'vitest';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { FormBindingProbe } from './test-support/form-binding.fixtures.js';
import { FormBindingProbe as ServerProbe } from './test-support/form-binding.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	it(`round-trips typed form controls through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerProbe, {}));
			host.innerHTML = result.html;
			const before = host.querySelector('input');
			hydrate(receipt(FormBindingProbe, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
			expect(host.querySelector('input')).toBe(before);
		} else render(receipt(FormBindingProbe, {}), host, { onErrorReport: (r) => reports.push(r) });
		await verifyFormBindingControls(host, () => {
			flushSync();
		});
		const input = host.querySelector<HTMLInputElement>('#form-radio-three')!;
		const output = host.querySelector('output')!;
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
		const prior = output.textContent;
		input.checked = true;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(output.textContent).toBe(prior);
	});
