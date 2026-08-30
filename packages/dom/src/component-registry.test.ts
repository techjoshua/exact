/** @vitest-environment jsdom */
import './structural-boundaries.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import { createOperation } from './test-support/native-operations.js';
import {
	ConcurrentRegistryApp,
	RegistryIdentityApp,
	SharedRegistryApp,
	StaleRegistryApp,
	identitySetups,
	identityUnmounts,
	registryIdentityAppInstance,
	sharedRegistryAppInstance,
	sharedSetups,
	sharedUnmounts,
	staleRegistryAppInstance
} from './test-support/components/component-registry.fixtures.js';
import {
	concurrentRegistryLoadCount,
	releaseConcurrentRegistryFixture,
	releaseStaleRegistryFixture,
	resetConcurrentRegistryFixture,
	resetStaleRegistryFixture,
	staleRegistryLoadCount,
	staleRegistrySetupCount
} from './test-support/components/component-registry-lazy-control.js';

describe('@exactjs/dom component registries', () => {
	it('retains same-key identity and replaces different registry keys', () => {
		identitySetups.length = 0;
		identityUnmounts.length = 0;
		const container = document.createElement('div');
		render(createOperation(RegistryIdentityApp, null), container);
		const app = registryIdentityAppInstance();

		app.state.label = 'updated';
		flushSync();
		expect(container.textContent).toBe('compactupdated');
		expect(identitySetups).toEqual(['first']);

		app.state.selected = 'comfortable';
		flushSync();
		expect(container.textContent).toBe('comfortablecomfortable:updated');
		expect(identitySetups).toEqual(['first', 'comfortable:updated']);
		expect(identityUnmounts).toEqual(['updated']);
		unmount(container);
	});

	it('deduplicates a lazy selection load across concurrent registry consumers', async () => {
		resetConcurrentRegistryFixture();
		const container = document.createElement('div');
		render(createOperation(ConcurrentRegistryApp, null), container);

		expect(container.textContent).toBe('loading');
		releaseConcurrentRegistryFixture();
		await vi.waitFor(() => expect(container.textContent).toBe('loadedloaded'));
		expect(concurrentRegistryLoadCount()).toBe(1);
		unmount(container);
	});

	it('treats registry keys as identity when they share one implementation', () => {
		sharedSetups.length = 0;
		sharedUnmounts.length = 0;
		const container = document.createElement('div');
		render(createOperation(SharedRegistryApp, null), container);
		const app = sharedRegistryAppInstance();
		app.state.selected = 'second';
		flushSync();

		expect(sharedSetups).toEqual(['first', 'second']);
		expect(sharedUnmounts).toEqual(['first']);
		expect(container.textContent).toBe('second');
		unmount(container);
	});

	it('discards stale lazy candidates during rapid selection changes', async () => {
		resetStaleRegistryFixture();
		const container = document.createElement('div');
		render(createOperation(StaleRegistryApp, null), container);
		const app = staleRegistryAppInstance();
		expect(container.textContent).toBe('loading');

		app.state.selected = 'ready';
		flushSync();
		await vi.waitFor(() => expect(container.textContent).toBe('ready'));
		releaseStaleRegistryFixture();
		await vi.waitFor(() => expect(staleRegistryLoadCount()).toBe(1));
		await Promise.resolve();
		expect(container.textContent).toBe('ready');
		expect(staleRegistrySetupCount()).toBe(0);

		app.state.selected = 'candidate';
		flushSync();
		await vi.waitFor(() => expect(container.textContent).toBe('lazy'));
		expect(staleRegistrySetupCount()).toBe(1);
		unmount(container);
	});
});
