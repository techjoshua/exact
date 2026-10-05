import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { expect, it, onTestFinished } from 'vitest';
import { reactiveProvenanceRoot } from './test-support/reactive-provenance.fixtures.js';
import { reactiveProvenanceRoot as serverRoot } from './test-support/reactive-provenance.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	it(`preserves lexical snapshots and live helper captures through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => dispose(host, true));
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
		const buttons = host.querySelectorAll('button');
		expect(output.textContent).toBe('1:1:2:1:11:10:11');
		for (const value of [2, 3]) {
			buttons[0].click();
			flushSync();
			expect(output.textContent).toBe(`1:1:${value * 2}:${value}:11:10:11`);
			expect(host.querySelector('output')).toBe(output);
		}
		buttons[1].click();
		flushSync();
		expect(output.textContent).toBe('1:1:6:3:23:20:23');
		expect(host.querySelector('button')).toBe(buttons[0]);
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});
