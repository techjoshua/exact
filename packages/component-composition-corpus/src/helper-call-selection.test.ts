/** @vitest-environment jsdom */
import { render, dispose } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it, onTestFinished, vi } from 'vitest';
import { helperCallSelectionRoot } from './test-support/helper-call-selection.fixtures.js';
import { helperCallSelectionRoot as serverRoot } from './test-support/helper-call-selection.fixtures.js?exact-target=server';

for (const mode of ['mount', 'hydrate'])
	for (const form of ['alias', 'shadow', 'extracted', 'higher-order'] as const)
		it(`preserves ${form} helper selection through ${mode}`, async () => {
			const container = document.createElement('div');
			document.body.append(container);
			const trace: string[] = [];
			const gates: { release(): void; signal: AbortSignal }[] = [];
			const reports: unknown[] = [];
			let removed = 0;
			onTestFinished(() => {
				dispose(container, true);
				for (const gate of gates) gate.release();
				container.remove();
			});
			const props = {
				form,
				record: (label: string) => trace.push(label),
				removed: () => removed++,
				wait: (signal: AbortSignal) =>
					new Promise<void>((release) => gates.push({ release, signal }))
			};
			const options = { onErrorReport: (report: unknown) => reports.push(report) };
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(serverRoot(props));
				container.innerHTML = output.html;
				const initial = container.querySelector('output');
				// Server rendering disposes its own owner before the client journey starts.
				removed = 0;
				hydrate(helperCallSelectionRoot(props), container, {
					...options,
					resumptions: output.resumptions,
					onMismatch: 'throw'
				});
				expect(container.querySelector('output')).toBe(initial);
			} else render(helperCallSelectionRoot(props), container, options);
			const button = container.querySelector('button')!;
			const output = container.querySelector('output')!;
			const expectedTrace =
				form === 'extracted'
					? ['receiver', 'argument', 'helper']
					: form === 'higher-order'
						? ['factory', 'argument', 'helper']
						: ['argument', 'helper'];
			for (const value of [2, 4]) {
				trace.length = 0;
				button.click();
				await vi.waitFor(() => expect(gates).toHaveLength(value / 2));
				expect(trace).toEqual(expectedTrace);
				expect(output.textContent).toBe(`${value - 2}:${value - 2}`);
				gates.at(-1)!.release();
				await vi.waitFor(() => expect(output.textContent).toBe(`${value}:${value}`));
				expect(container.querySelector('button')).toBe(button);
				expect(container.querySelector('output')).toBe(output);
			}
			button.click();
			await vi.waitFor(() => expect(gates).toHaveLength(3));
			dispose(container, true);
			expect(gates[2]!.signal.aborted).toBe(true);
			gates[2]!.release();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(container.childNodes).toHaveLength(0);
			expect(removed).toBe(1);
			expect(reports).toEqual([]);
		});
