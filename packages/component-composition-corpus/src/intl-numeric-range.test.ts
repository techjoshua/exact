/// <reference lib="es2023.intl" />
import { expect, it, onTestFinished } from 'vitest';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { IntlNumericRangeProbe } from './test-support/intl-numeric-range.fixtures.js';
import { IntlNumericRangeProbe as ServerProbe } from './test-support/intl-numeric-range.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	it(`retains numeric range semantics through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerProbe, {}));
			host.innerHTML = result.html;
			const initial = host.querySelector('output');
			hydrate(receipt(IntlNumericRangeProbe, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
			expect(host.querySelector('output')).toBe(initial);
		} else
			render(receipt(IntlNumericRangeProbe, {}), host, { onErrorReport: (r) => reports.push(r) });
		const output = host.querySelector('output')!;
		const next = host.querySelector('button')!;
		for (const end of [1, 2, 3]) {
			const number = new Intl.NumberFormat('en-US').formatRange(1, end);
			const currency = new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: 'USD',
				currencyDisplay: 'code'
			}).formatRange(1, end);
			expect(output.textContent).toBe(`${number} / ${currency}`);
			expect(host.querySelector('output')).toBe(output);
			if (end < 3) {
				next.click();
				flushSync();
			}
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});
