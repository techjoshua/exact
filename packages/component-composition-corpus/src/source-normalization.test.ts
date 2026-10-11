import { expect, it, onTestFinished } from 'vitest';
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { createCompiledComponentReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import {
	NormalizationProbe,
	AsyncNormalizationProbe,
	NormalizationCallbackProbe,
	NormalizationSnapshotProbe,
	NormalizationHelperSnapshotProbe,
	NormalizationExplicitTaskProbe,
	NormalizationExplicitSetupProbe,
	NormalizationExplicitHelperProbe
} from './test-support/source-normalization.fixtures.js';
import {
	NormalizationProbe as ServerProbe,
	AsyncNormalizationProbe as ServerAsync,
	NormalizationCallbackProbe as ServerCallbacks,
	NormalizationSnapshotProbe as ServerSnapshot,
	NormalizationHelperSnapshotProbe as ServerHelperSnapshot,
	NormalizationExplicitTaskProbe as ServerExplicit,
	NormalizationExplicitSetupProbe as ServerExplicitSetup,
	NormalizationExplicitHelperProbe as ServerExplicitHelper
} from './test-support/source-normalization.fixtures.js?exact-target=server';

import { NormalizationServerSnapshotProbe as ServerSnapshotAuthority } from './test-support/source-normalization-server.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	it(`preserves inferred setup computations through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerProbe, {}));
			host.innerHTML = result.html;
			const initial = host.querySelector('output');
			hydrate(receipt(NormalizationProbe, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
			expect(host.querySelector('output')).toBe(initial);
		} else render(receipt(NormalizationProbe, {}), host, { onErrorReport: (r) => reports.push(r) });
		const output = host.querySelector('output');
		for (const expected of ['2 / 3', '3 / 4', '4 / 5']) {
			expect(output?.textContent).toBe(expected);
			expect(host.querySelector('output')).toBe(output);
			host.querySelector('button')!.click();
			flushSync();
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});

it('hydrates async setup alongside an independent render local', async () => {
	const host = document.createElement('div');
	const reports: unknown[] = [];
	onTestFinished(() => {
		dispose(host, true);
	});
	const result = await renderToHydratableString(receipt(ServerAsync, {}));
	host.innerHTML = result.html;
	const output = host.querySelector('output');
	expect(output?.textContent).toBe('99:2');
	hydrate(receipt(AsyncNormalizationProbe, {}), host, {
		resumptions: result.resumptions,
		onMismatch: 'throw',
		onErrorReport: (r) => reports.push(r)
	});
	expect(host.querySelector('output')).toBe(output);
	for (const expected of ['99:2', '100:2', '101:2']) {
		expect(output?.textContent).toBe(expected);
		expect(host.querySelector('output')).toBe(output);
		output!.click();
		flushSync();
	}
	dispose(host, true);
	expect(host.childNodes).toHaveLength(0);
	expect(reports).toEqual([]);
});

for (const mode of ['mount', 'hydrate'])
	for (const kind of ['callback', 'snapshot', 'helper'])
		it(`retains ${kind} readers through ${mode}`, async () => {
			const host = document.createElement('div');
			const reports: unknown[] = [];
			onTestFinished(() => {
				dispose(host, true);
			});
			if (mode === 'hydrate') {
				const result = await renderToHydratableString(
					receipt(
						kind === 'helper'
							? ServerHelperSnapshot
							: kind === 'snapshot'
								? ServerSnapshot
								: ServerCallbacks,
						{}
					)
				);
				host.innerHTML = result.html;
				hydrate(
					receipt(
						kind === 'helper'
							? NormalizationHelperSnapshotProbe
							: kind === 'snapshot'
								? NormalizationSnapshotProbe
								: NormalizationCallbackProbe,
						{}
					),
					host,
					{
						resumptions: result.resumptions,
						onMismatch: 'throw',
						onErrorReport: (r) => reports.push(r)
					}
				);
			} else
				render(
					receipt(
						kind === 'helper'
							? NormalizationHelperSnapshotProbe
							: kind === 'snapshot'
								? NormalizationSnapshotProbe
								: NormalizationCallbackProbe,
						{}
					),
					host,
					{
						onErrorReport: (r) => reports.push(r)
					}
				);
			const outputs = [...host.querySelectorAll('output')];
			for (const expected of kind === 'helper'
				? ['2', '4', '6']
				: kind === 'snapshot'
					? ['1', '3', '6']
					: ['3', '4', '5']) {
				expect(outputs.map((output) => output.textContent)).toEqual(
					Array(kind === 'callback' ? 4 : 1).fill(expected)
				);
				expect([...host.querySelectorAll('output')]).toEqual(outputs);
				if (kind === 'helper') {
					host.querySelector<HTMLButtonElement>('#normalization-helper-snapshot')!.click();
					flushSync();
					expect(outputs[0]?.textContent).toBe(expected);
				}
				host.querySelector('button')!.click();
				flushSync();
			}
			dispose(host, true);
			expect(host.childNodes).toHaveLength(0);
			expect(reports).toEqual([]);
		});

for (const mode of ['mount', 'hydrate'])
	it(`keeps explicit task body reads out of activation through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerExplicit, {}));
			host.innerHTML = result.html;
			hydrate(receipt(NormalizationExplicitTaskProbe, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
		} else
			render(receipt(NormalizationExplicitTaskProbe, {}), host, {
				onErrorReport: (r) => reports.push(r)
			});
		flushSync();
		const output = host.querySelector('output');
		for (const expected of ['1', '3', '6']) {
			expect(output?.textContent).toBe(expected);
			host.querySelector<HTMLButtonElement>('#normalization-explicit-input')!.click();
			flushSync();
			expect(output?.textContent).toBe(expected);
			expect(host.querySelector('output')).toBe(output);
			host.querySelector<HTMLButtonElement>('#normalization-explicit-run')!.click();
			flushSync();
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});

for (const mode of ['mount', 'hydrate'])
	it(`keeps an explicit setup task at one startup run through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerExplicitSetup, {}));
			host.innerHTML = result.html;
			hydrate(receipt(NormalizationExplicitSetupProbe, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
		} else
			render(receipt(NormalizationExplicitSetupProbe, {}), host, {
				onErrorReport: (r) => reports.push(r)
			});
		flushSync();
		const output = host.querySelector('output');
		for (let step = 0; step < 3; step++) {
			expect(output?.textContent).toBe('2');
			expect(host.querySelector('output')).toBe(output);
			host.querySelector('button')!.click();
			flushSync();
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});

it('retains server snapshot read authority through a named callback', async () => {
	const result = await renderToHydratableString(receipt(ServerSnapshotAuthority, {}));
	expect(result.html).toContain('id="normalization-server-snapshot-result">2</output>');
});

for (const mode of ['mount', 'hydrate'])
	it(`keeps explicit helper captures untracked through ${mode}`, async () => {
		const host = document.createElement('div');
		const reports: unknown[] = [];
		onTestFinished(() => {
			dispose(host, true);
		});
		if (mode === 'hydrate') {
			const result = await renderToHydratableString(receipt(ServerExplicitHelper, {}));
			host.innerHTML = result.html;
			hydrate(receipt(NormalizationExplicitHelperProbe, {}), host, {
				resumptions: result.resumptions,
				onMismatch: 'throw',
				onErrorReport: (r) => reports.push(r)
			});
		} else
			render(receipt(NormalizationExplicitHelperProbe, {}), host, {
				onErrorReport: (r) => reports.push(r)
			});
		const output = host.querySelector('output');
		for (const expected of ['2', '4', '6']) {
			flushSync();
			expect(output?.textContent).toBe(expected);
			host.querySelector<HTMLButtonElement>('[data-snapshot]')!.click();
			flushSync();
			expect(output?.textContent).toBe(expected);
			expect(host.querySelector('output')).toBe(output);
			if (expected !== '6') host.querySelector<HTMLButtonElement>('[data-input]')!.click();
		}
		dispose(host, true);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	});
