import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate/enhanced';
import { flushSync } from '@exactjs/reactive';
import { renderToHydratableString } from '@exactjs/ssr/enhanced';
import { expect, it, onTestFinished, vi } from 'vitest';
import {
	pendingOwnerRoot,
	type PendingOwnerProps
} from './test-support/pending-owner-overlap.fixtures.js';
import { pendingOwnerRoot as serverRoot } from './test-support/pending-owner-overlap.fixtures.js?exact-target=server';
import { corpus } from './scenarios/enhancement-implementation.fixtures.js';
import { corpus as serverCorpus } from './scenarios/enhancement-implementation.fixtures.js?exact-target=server';

const identity = '../scenarios/enhancement-routing.fixtures.js#corpus';

for (const entry of ['mount', 'hydrate'] as const)
	for (const enhanced of [false, true])
		it(`${entry}/enhanced=${enhanced}: fences pending helpers across prop rebinding and keyed ownership`, async () => {
			const container = document.createElement('div');
			document.body.append(container);
			const gates: { signal: AbortSignal; release(): void }[] = [];
			const removed: string[] = [];
			const reports: unknown[] = [];
			onTestFinished(() => {
				dispose(container, true);
				for (const gate of gates) gate.release();
				container.remove();
			});
			let props: PendingOwnerProps = {
				id: 'first',
				enhanced,
				wait: (signal) => new Promise<void>((release) => gates.push({ signal, release })),
				removed: (id) => removed.push(id)
			};
			const options = {
				enhancementCatalog: new Map([[identity, corpus]]),
				onErrorReport: (report: unknown) => reports.push(report)
			};
			if (entry === 'hydrate') {
				const rendered = await renderToHydratableString(serverRoot(props), {
					enhancementCatalog: new Map([[identity, serverCorpus]])
				});
				container.innerHTML = rendered.html;
				const initial = container.querySelector('section');
				hydrate(pendingOwnerRoot(props), container, {
					...options,
					resumptions: rendered.resumptions,
					onMismatch: 'throw'
				});
				expect(container.querySelector('section')).toBe(initial);
			} else render(pendingOwnerRoot(props), container, options);
			removed.length = 0;
			const firstHost = container.querySelector('section')!;
			const firstButton = firstHost.querySelector<HTMLButtonElement>('button')!;
			const firstOutput = firstHost.querySelector('output')!;
			expect(firstButton.textContent).toBe('default');
			firstButton.click();
			await vi.waitFor(() => expect(gates).toHaveLength(1));
			expect(firstOutput.textContent).toBe('idle');
			props = { ...props, label: 'fresh' };
			render(pendingOwnerRoot(props), container, options);
			flushSync();
			expect(container.querySelector('section')).toBe(firstHost);
			expect(firstHost.querySelector('button')).toBe(firstButton);
			expect(firstButton.textContent).toBe('fresh');
			if (enhanced) expect(firstButton.dataset.corpusTone).toBe('fresh');
			// Props refresh the next invocation without restarting or changing the captured input.
			expect(gates[0]!.signal.aborted).toBe(false);
			gates[0]!.release();
			await vi.waitFor(() => expect(firstOutput.textContent).toBe('default:done'));
			firstButton.click();
			await vi.waitFor(() => expect(gates).toHaveLength(2));
			gates[1]!.release();
			await vi.waitFor(() => expect(firstOutput.textContent).toBe('fresh:done'));
			firstButton.click();
			await vi.waitFor(() => expect(gates).toHaveLength(3));
			props = { ...props, id: 'second', label: undefined };
			render(pendingOwnerRoot(props), container, options);
			flushSync();
			const secondHost = container.querySelector('section')!;
			const secondButton = secondHost.querySelector<HTMLButtonElement>('button')!;
			expect(secondHost).not.toBe(firstHost);
			expect(firstHost.isConnected).toBe(false);
			expect(gates[2]!.signal.aborted).toBe(true);
			expect(removed).toEqual(['first']);
			gates[2]!.release();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(secondHost.querySelector('output')!.textContent).toBe('idle');
			firstButton.click();
			expect(gates).toHaveLength(3);
			secondButton.click();
			await vi.waitFor(() => expect(gates).toHaveLength(4));
			gates[3]!.release();
			await vi.waitFor(() =>
				expect(secondHost.querySelector('output')!.textContent).toBe('default:done')
			);
			secondButton.click();
			await vi.waitFor(() => expect(gates).toHaveLength(5));
			dispose(container, true);
			expect(gates[4]!.signal.aborted).toBe(true);
			gates[4]!.release();
			await new Promise((resolve) => setTimeout(resolve, 0));
			secondButton.click();
			expect(gates).toHaveLength(5);
			expect(container.childNodes).toHaveLength(0);
			expect(removed).toEqual(['first', 'second']);
			expect(reports).toEqual([]);
		});
