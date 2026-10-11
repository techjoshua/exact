import { expect, it, onTestFinished } from 'vitest';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { IntlProjectionProbe } from './test-support/intl-projection.fixtures.js';
import { IntlProjectionProbe as ServerProbe } from './test-support/intl-projection.fixtures.js?exact-target=server';
import { intlProjectionExpected } from '../test-support/intl-projection-journey.mjs';

for (const mode of ['mount', 'hydrate'])
	it(`retains native Intl projection semantics through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerProbe, {}));
			host.innerHTML = result.html;
			const initial = host.querySelector('output');
			hydrate(receipt(IntlProjectionProbe, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
			expect(host.querySelector('output')).toBe(initial);
		} else
			render(receipt(IntlProjectionProbe, {}), host, { onErrorReport: (r) => reports.push(r) });
		const output = host.querySelector('output');
		for (const step of [0, 1, 2]) {
			expect(output?.textContent).toBe(intlProjectionExpected(step));
			expect(host.querySelector('output')).toBe(output);
			if (step < 2) {
				host.querySelector('button')!.click();
				flushSync();
			}
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});
