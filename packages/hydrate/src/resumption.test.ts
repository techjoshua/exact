/** @vitest-environment jsdom */
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import { renderToHydratableStringAsync } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate } from './index.js';
import { normalizeSerializedComponentResumptions } from './config-validation.js';
import { createComponentResumptionResolver } from './runtime/resumption.js';
import {
	initialPageRoot as serverInitialPageRoot,
	prerenderedShellRoot as serverPrerenderedShellRoot,
	readSearchRuns as readServerSearchRuns,
	readStatusRuns as readServerStatusRuns,
	resumableSearchRoot as serverResumableSearchRoot,
	resumptionProviderRoot as serverResumptionProviderRoot
} from './test-support/resumption.fixtures.js?exact-target=server';
import {
	buildMismatchRoot,
	initialPageRoot,
	navigatedPageRoot,
	navigatedShellRoot,
	readSearchRuns,
	readStatusRuns,
	ResumableCounter,
	ResumableFirst,
	ResumableSecond,
	resumableSearchRoot,
	resumptionProviderRoot
} from './test-support/resumption.fixtures.js';

describe('@exactjs/hydrate component resumption', () => {
	it('expands compiler-indexed wire values against the receiving component contract', () => {
		const componentId = exactComponentIdentity(ResumableCounter);
		const records = normalizeSerializedComponentResumptions([[componentId, [[0, 'ready']]]])!;
		const resolver = createComponentResumptionResolver(() => records);

		expect(resolver(ResumableCounter)).toBe(records[0]);
	});

	it('rejects a compact wire index outside the receiving component contract', () => {
		const componentId = exactComponentIdentity(ResumableCounter);
		const records = normalizeSerializedComponentResumptions([[componentId, [[1, 'undeclared']]]])!;
		const resolver = createComponentResumptionResolver(() => records);

		expect(() => resolver(ResumableCounter)).toThrow(`index is outside component ${componentId}`);
	});

	it('rejects numeric and named aliases for the same receiving field', () => {
		const componentId = exactComponentIdentity(ResumableCounter);
		const records = normalizeSerializedComponentResumptions([
			[
				componentId,
				[
					[0, 'first'],
					['label', 'second']
				]
			]
		])!;
		const resolver = createComponentResumptionResolver(() => records);

		expect(() => resolver(ResumableCounter)).toThrow(
			`Duplicate eXact resumption field ${componentId}:label`
		);
	});

	it('claims SSR activations in component tree order and restores the cursor on rollback', () => {
		const firstId = exactComponentIdentity(ResumableFirst);
		const secondId = exactComponentIdentity(ResumableSecond);
		const records = [
			{
				componentId: firstId,
				values: { label: 'first-server' },
				contexts: {},
				settledContinuations: []
			},
			{
				componentId: secondId,
				values: { label: 'second-server' },
				contexts: {},
				settledContinuations: []
			},
			{
				componentId: firstId,
				values: { label: 'first-server-2' },
				contexts: {},
				settledContinuations: []
			}
		];
		const resolve = createComponentResumptionResolver(() => records);

		expect(resolve(ResumableFirst)?.values.label).toBe('first-server');
		const checkpoint = resolve.checkpoint();
		expect(resolve(ResumableSecond)?.values.label).toBe('second-server');
		resolve.rollback(checkpoint);
		expect(resolve(ResumableSecond)?.values.label).toBe('second-server');
		expect(resolve(ResumableFirst)?.values.label).toBe('first-server-2');
	});

	it('rejects a component that attempts to skip the next tree-ordered activation', () => {
		const firstId = exactComponentIdentity(ResumableFirst);
		const records = [
			{
				componentId: firstId,
				values: { label: 'first-server' },
				contexts: {},
				settledContinuations: []
			}
		];
		const resolve = createComponentResumptionResolver(() => records);

		expect(() => resolve(ResumableSecond)).toThrow(
			`expected component ${firstId} before ${exactComponentIdentity(ResumableSecond)}`
		);
	});

	it('limits SSR activation records to adoption so later client navigation mounts fresh state', async () => {
		const rendered = await renderToHydratableStringAsync(serverInitialPageRoot);
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;

		const client = hydrate(initialPageRoot, container, { onMismatch: 'throw' });

		expect(container.querySelector('p')?.textContent).toBe('initial');
		expect(() => hydrate(navigatedPageRoot, container)).not.toThrow();
		expect(container.querySelector('p')?.textContent).toBe('navigated');
		client.dispose();
	});

	it('mounts a fresh route when the browser location changes before SSR adoption', async () => {
		const rendered = await renderToHydratableStringAsync(serverPrerenderedShellRoot);
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;

		const client = hydrate(navigatedShellRoot, container, { onMismatch: 'replace' });

		expect(container.querySelector('p')?.textContent).toBe('navigated');
		client.dispose();
	});

	it('adopts SSR state without repeating settled work and reruns after a dependency change', async () => {
		const rendered = await renderToHydratableStringAsync(serverResumableSearchRoot);
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
		const serverOutput = container.querySelector('output');

		const client = hydrate(resumableSearchRoot, container, { onMismatch: 'throw' });

		expect(readServerSearchRuns()).toBe(1);
		expect(readSearchRuns()).toBe(0);
		expect(container.querySelector('output')).toBe(serverOutput);
		expect(serverOutput?.textContent).toBe('FIRST');

		container.querySelector('button')!.click();
		await vi.waitFor(() => expect(serverOutput?.textContent).toBe('SECOND'));

		expect(readSearchRuns()).toBe(1);
		client.dispose();
	});

	it('rejects SSR output produced by a different immutable client build', () => {
		const container = document.createElement('main');
		container.innerHTML =
			'<!--exact:component:Root--><p>server</p><!--/exact:component:Root-->' +
			'<script type="application/json" id="__exact_hydration">{"buildKey":"server-build"}</script>';

		expect(() =>
			hydrate(buildMismatchRoot, container, {
				buildKey: 'client-build',
				onMismatch: 'throw'
			})
		).toThrow('build identities do not match');
	});

	it('restores a settled shared context before constructing its descendants', async () => {
		const rendered = await renderToHydratableStringAsync(serverResumptionProviderRoot);
		const container = document.createElement('main');
		container.innerHTML = rendered.htmlWithHydration;
		const serverOutput = container.querySelector('output');

		const client = hydrate(resumptionProviderRoot, container, { onMismatch: 'throw' });

		expect(readServerStatusRuns()).toBe(1);
		expect(readStatusRuns()).toBe(0);
		expect(container.querySelector('output')).toBe(serverOutput);
		expect(serverOutput?.textContent).toBe('ready');
		client.dispose();
	});
});
