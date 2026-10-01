import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, onTestFinished } from 'vitest';
import { verifyMutationContract } from '../test-support/mutation-contract-journey.mjs';
import { mutationContractRoot } from './test-support/mutation-contract.fixtures.js';
import { mutationContractRoot as serverRoot } from './test-support/mutation-contract.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	it(`preserves authored mutation contracts through ${mode}`, async () => {
		const host = document.createElement('div');
		document.body.append(host);
		onTestFinished(() => {
			dispose(host, true);
			host.remove();
		});
		const reports: unknown[] = [];
		const options = { onErrorReport: (report: unknown) => reports.push(report) };
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(serverRoot());
			host.innerHTML = result.html;
			const output = host.querySelector('output');
			const owner = hydrate(mutationContractRoot(), host, {
				...options,
				resumptions: result.resumptions,
				onMismatch: 'throw'
			});
			await owner.whenSettled();
			expect(host.querySelector('output')).toBe(output);
		} else render(mutationContractRoot(), host, options);
		await verifyMutationContract(host);
		expect(reports).toEqual([]);
		const button = host.querySelector('button')!;
		dispose(host, true);
		button.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(host.childNodes.length).toBe(0);
	});
