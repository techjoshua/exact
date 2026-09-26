import { dispose, render } from '@exactjs/dom';
import { hydrate } from '@exactjs/hydrate/enhanced';
import { renderToHydratableString } from '@exactjs/ssr/enhanced';
import { observationRoots as serverRoots } from './test-support/task-observation.fixtures.js?exact-target=server';
import { flushSync } from '@exactjs/reactive';
import { expect, it, onTestFinished } from 'vitest';
import { observationRoots, suspenseRoots } from './test-support/task-observation.fixtures.js';
import { taskProbes } from './test-support/task-observations.js';

function containerForTest() {
	const container = document.createElement('div');
	document.body.append(container);
	taskProbes.length = 0;
	onTestFinished(() => {
		dispose(container, true);
		container.remove();
	});
	return container;
}
function inputQuery(container: HTMLElement, query: string) {
	const input = container.querySelector('input')!;
	input.value = query;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}
async function expectStarts(queries: string[]) {
	await expect.poll(() => taskProbes.map((probe) => probe.query)).toEqual(queries);
}

it.each(
	(Object.keys(observationRoots) as (keyof typeof observationRoots)[]).flatMap((variant) =>
		['mount', 'hydrate'].map((entry) => ({ variant, entry }))
	)
)(
	'$variant/$entry observation preserves initialization, reactive replacement, invocation and disposal',
	async ({ variant, entry }) => {
		const container = containerForTest();
		if (entry === 'hydrate') {
			const server = await renderToHydratableString(serverRoots[variant]);
			container.innerHTML = server.html;
			const serverInput = container.querySelector('input');
			if (variant === 'view' || variant === 'direct')
				expect(container.querySelector('[data-pending-count]')?.textContent).toBe('0');
			hydrate(observationRoots[variant], container, {
				resumptions: server.resumptions,
				onMismatch: 'throw'
			});
			expect(container.querySelector('input')).toBe(serverInput);
		} else render(observationRoots[variant], container);
		await expectStarts(['initial']);
		taskProbes[0]!.resolve('initial result');
		await expect.poll(() => container.querySelector('output')?.textContent).toBe('initial result');
		const input = container.querySelector('input');
		inputQuery(container, 'slow');
		await expectStarts(['initial', 'slow']);
		if (variant === 'view' || variant === 'direct')
			await expect
				.poll(() => container.querySelector('[data-status]')?.textContent)
				.toBe('pending');
		inputQuery(container, 'current');
		await expectStarts(['initial', 'slow', 'current']);
		expect(taskProbes[1]!.signal.aborted).toBe(true);
		taskProbes[2]!.resolve('current result');
		await expect.poll(() => container.querySelector('output')?.textContent).toBe('current result');
		taskProbes[1]!.resolve('stale result');
		await expect.poll(() => taskProbes.slice(0, 3).every((probe) => probe.cleaned)).toBe(true);
		expect(container.querySelector('output')?.textContent).toBe('current result');
		expect(container.querySelector('input')).toBe(input);
		if (variant === 'event') {
			container.querySelector('button')!.click();
			await expectStarts(['initial', 'slow', 'current', 'manual']);
			taskProbes[3]!.resolve('manual result');
			await expect.poll(() => container.querySelector('output')?.textContent).toBe('manual result');
		}
		inputQuery(container, 'last');
		await expect.poll(() => taskProbes.at(-1)?.query).toBe('last');
		dispose(container, true);
		await expect.poll(() => taskProbes.at(-1)?.cleaned).toBe(true);
		expect(taskProbes.at(-1)?.signal.aborted).toBe(true);
		expect(container.textContent).toBe('');
	}
);

it.each(['blocking', 'nonblocking'] as const)(
	'%s status and Suspense retain distinct behavior',
	async (policy) => {
		const container = containerForTest();
		render(suspenseRoots[policy], container);
		await expectStarts(['initial']);
		if (policy === 'blocking') {
			expect(container.querySelector('[data-fallback]')?.textContent).toBe('Waiting');
			expect(container.querySelector('input')).toBeNull();
		} else {
			expect(container.querySelector('[data-fallback]')).toBeNull();
			expect(container.querySelector('input')?.disabled).toBe(false);
			await expect
				.poll(() => container.querySelector('[data-status]')?.textContent)
				.toBe('pending');
		}
		taskProbes[0]!.resolve('ready');
		await expect.poll(() => container.querySelector('output')?.textContent).toBe('ready');
		await expect.poll(() => container.querySelector('[data-status]')?.textContent).toBe('idle');
		expect(container.querySelector('[data-fallback]')).toBeNull();
		inputQuery(container, 'again');
		await expectStarts(['initial', 'again']);
		expect(container.querySelector('output')?.textContent).toBe('ready');
		taskProbes[1]!.resolve('updated');
		await expect.poll(() => container.querySelector('output')?.textContent).toBe('updated');
	}
);
