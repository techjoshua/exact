import { render, unmount } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { composeExactComponentContracts } from '@exactjs/core/framework/component-contracts';
import { expect, it, vi } from 'vitest';
import {
	NestedProjection,
	LiteralProjection,
	ComputedProjection,
	RootProjection,
	inputRelationshipOwner,
	inputRelationshipRoot
} from './test-support/nested-input-relationships.fixtures.js';
import { inputRelationshipRoot as serverRoot } from './test-support/nested-input-relationships.fixtures.js?exact-target=server';

it.each(['mount', 'hydrate'] as const)(
	'tracks nested input relationships through %s and retained updates',
	async (mode) => {
		const container = document.createElement('div');
		const reports: unknown[] = [];
		try {
			if (mode === 'hydrate') {
				const output = await renderToHydratableString(serverRoot());
				container.innerHTML = output.html;
				const original = container.querySelector('output');
				hydrate(inputRelationshipRoot(), container, {
					islands: composeExactComponentContracts(
						[NestedProjection, RootProjection, LiteralProjection, ComputedProjection],
						'client'
					).implementations,
					resumptions: output.resumptions,
					onMismatch: 'throw',
					onErrorReport: (r) => reports.push(r.error)
				});
				expect(container.querySelector('output')).toBe(original);
			} else
				render(inputRelationshipRoot(), container, { onErrorReport: (r) => reports.push(r.error) });
			const nodes = Array.from(container.querySelectorAll('output'));
			const expectValue = async (value: number) => {
				await vi.waitFor(() => {
					for (const node of nodes) expect(node.textContent).toBe(String(value));
				});
				expect(Array.from(container.querySelectorAll('output'))).toEqual(nodes);
			};
			await expectValue(1);
			for (const value of [2, 3]) {
				inputRelationshipOwner.state.record!.value++;
				flushSync();
				await expectValue(value);
			}
			const retired = inputRelationshipOwner.state.record!;
			inputRelationshipOwner.state.record = { value: 10 };
			flushSync();
			await expectValue(10);
			retired.value = 100;
			flushSync();
			await expectValue(10);
			inputRelationshipOwner.state.record = undefined;
			flushSync();
			await expectValue(0);
			inputRelationshipOwner.state.record = { value: 20 };
			flushSync();
			await expectValue(20);
			unmount(container);
			inputRelationshipOwner.state.record.value = 30;
			flushSync();
			for (const node of nodes) expect(node.textContent).toBe('20');
			expect(reports).toEqual([]);
			expect(container.childNodes.length).toBe(0);
		} finally {
			unmount(container);
		}
	}
);
