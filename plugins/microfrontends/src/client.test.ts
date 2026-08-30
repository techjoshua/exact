/**
 * @vitest-environment jsdom
 */
import { type AnyComponentInstance, type Component } from '@exactjs/core';
import { findComponentDomNode, findNodeOwnerInstance, render, unmount } from '@exactjs/dom';
import '@exactjs/core/runtime/tasks';
import { inspectDomRoot, type DomInspectionNode } from '@exactjs/dom/testing';
import { getHydrationRoot, type CoreHydrationRoot, type ExactClient } from '@exactjs/hydrate';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadExactRemoteModule, registerExactRemoteClientBindings } from './client.js';
import {
	fallbackRemoteRoot,
	incrementPatchingChild,
	pairedRetiringRoot,
	patchingChild,
	patchingLifecycle,
	patchingPageRoot,
	remoteRoot,
	replacementPageRoot,
	resetPatchingLifecycle,
	setShellProfileName,
	shellPageRoot,
	updateReplacementPage
} from './client.fixtures.js';
import {
	installRemoteComponentFixtures,
	remoteComponentReference,
	removeRemoteComponentFixtures
} from './test-support/remote-component-fixture.js';
import * as remoteFixtureComponents from './remote-components.fixtures.js';
import { stubUnsupportedBuild } from './test-support/unsupported-build.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

const probeRegistration = JSON.stringify({
	continuations: {
		probe: {
			id: 'probe',
			componentId: 'test:probe',
			stateReads: [],
			stateWrites: [],
			publicContexts: [],
			serverContexts: [],
			boundaries: []
		}
	}
});
const entrySource = `
${remoteComponentReference('BillingArea')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/billing#./BillingArea",
  component: BillingArea,
  registration: ${probeRegistration}
});`;
const clientEntry = `data:text/javascript;base64,${Buffer.from(entrySource).toString('base64')}`;
const brandSource = `
${remoteComponentReference('BrandArea')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/brand#./BrandArea",
  component: BrandArea,
  registration: ${probeRegistration}
});`;
const brandEntry = `data:text/javascript;base64,${Buffer.from(brandSource).toString('base64')}`;
const shellSource = `
${remoteComponentReference('Shell')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/brand#./Shell",
  component: Shell,
  registration: ${probeRegistration}
});`;
const shellEntry = `data:text/javascript;base64,${Buffer.from(shellSource).toString('base64')}`;
const patchingSource = `
${remoteComponentReference('PatchingShell')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/brand#./PatchingShell",
  component: PatchingShell,
  registration: ${probeRegistration}
});`;
const patchingEntry = `data:text/javascript;base64,${Buffer.from(patchingSource).toString('base64')}`;
const replacementBuildKey = '89abcdef0123456789abcdef0123456789abcdef';
const retiringSource = `
${remoteComponentReference('RetiringArea')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/retiring#./Area",
  component: RetiringArea,
  registration: ${probeRegistration}
});`;
const retiringEntry = `data:text/javascript;base64,${Buffer.from(retiringSource).toString('base64')}`;
const replacementSource = `
${remoteComponentReference('ReplacementArea')}
export default Object.freeze({
  buildKey: "${replacementBuildKey}",
  root: "@company/retiring#./Area",
  component: ReplacementArea,
  registration: ${probeRegistration}
});`;
const replacementEntry = `data:text/javascript;base64,${Buffer.from(replacementSource).toString('base64')}`;
const resolveRetiringEntry = vi.fn(async () => replacementEntry);
const retiringShellSource = `
${remoteComponentReference('RetiringShell')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/retiring#./Shell",
  component: RetiringShell,
  registration: ${probeRegistration}
});`;
const retiringShellEntry = `data:text/javascript;base64,${Buffer.from(retiringShellSource).toString('base64')}`;
const replacementShellSource = `
${remoteComponentReference('ReplacementShell')}
export default Object.freeze({
  buildKey: "${replacementBuildKey}",
  root: "@company/retiring#./Shell",
  component: ReplacementShell,
  registration: ${probeRegistration}
});`;
const replacementShellEntry = `data:text/javascript;base64,${Buffer.from(replacementShellSource).toString('base64')}`;
const resolveRetiringShellEntry = vi.fn(async () => replacementShellEntry);
const resolveUnchangedEntry = vi.fn(async () => retiringEntry);
const resolveRejectedEntry = vi.fn(async () => {
	throw new Error('replacement unavailable');
});
const slowEntry = dataModule(`
await new Promise((resolve) => { globalThis.__releaseSlowRemote = resolve; });
${entrySource}`);
const unmountedSlowEntry = dataModule(`
await new Promise((resolve) => { globalThis.__releaseUnmountedRemote = resolve; });
${brandSource}`);
const brokenEntry = dataModule('throw new Error("remote import failed");');
const bindings = Object.freeze({
	billing: Object.freeze({ clientEntry }),
	brand: Object.freeze({ clientEntry: brandEntry }),
	shell: Object.freeze({ clientEntry: shellEntry }),
	patching: Object.freeze({ clientEntry: patchingEntry }),
	retiring: Object.freeze({
		clientEntry: retiringEntry,
		resolveClientEntry: resolveRetiringEntry
	}),
	retiringShell: Object.freeze({
		clientEntry: retiringShellEntry,
		resolveClientEntry: resolveRetiringShellEntry
	}),
	unchanged: Object.freeze({
		clientEntry: retiringEntry,
		resolveClientEntry: resolveUnchangedEntry
	}),
	rejecting: Object.freeze({
		clientEntry: retiringEntry,
		resolveClientEntry: resolveRejectedEntry
	}),
	slow: Object.freeze({ clientEntry: slowEntry }),
	unmountedSlow: Object.freeze({ clientEntry: unmountedSlowEntry }),
	broken: Object.freeze({ clientEntry: brokenEntry })
});

describe('RemoteComponent', () => {
	beforeAll(() => {
		installRemoteComponentFixtures(remoteFixtureComponents);
		registerExactRemoteClientBindings(bindings);
	});
	afterAll(removeRemoteComponentFixtures);
	afterEach(() => {
		vi.unstubAllGlobals();
		resolveRetiringEntry.mockClear();
		resolveRetiringShellEntry.mockClear();
		resolveUnchangedEntry.mockClear();
		resolveRejectedEntry.mockClear();
		delete (globalThis as Record<string, unknown>).__releaseSlowRemote;
		delete (globalThis as Record<string, unknown>).__releaseUnmountedRemote;
	});

	it('times out a stalled shared remote entry load', async () => {
		vi.useFakeTimers();
		const loaderSymbol = Symbol.for('@exactjs/microfrontends/remote-loader');
		(globalThis as Record<PropertyKey, unknown>)[loaderSymbol] = {
			load(_url: string, _integrity: string, signal: AbortSignal) {
				return new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(signal.reason), { once: true });
				});
			},
			publish() {}
		};
		try {
			const loaded = loadExactRemoteModule(
				'https://remote.test/stalled-timeout.js',
				'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
			);
			const rejected = expect(loaded).rejects.toThrow('timed out');
			await vi.advanceTimersByTimeAsync(30_000);
			await rejected;
		} finally {
			delete (globalThis as Record<PropertyKey, unknown>)[loaderSymbol];
			vi.useRealTimers();
		}
	});

	it.each([
		['empty URL', ''],
		['missing module value', dataModule('export default undefined;')],
		[
			'invalid build key',
			dataModule(
				'export default { buildKey: "release", root: "area", component() {}, registration: {} };'
			)
		],
		[
			'missing root',
			dataModule(
				`export default { buildKey: "${buildKey}", root: "", component() {}, registration: {} };`
			)
		],
		[
			'non-function component',
			dataModule(
				`export default { buildKey: "${buildKey}", root: "area", component: {}, registration: {} };`
			)
		],
		[
			'identity-only component',
			dataModule(
				`function IdentityOnly() {}; Object.assign(IdentityOnly, { [Symbol.for("@exactjs/component")]: "test:identity-only" }); export default { buildKey: "${buildKey}", root: "area", component: IdentityOnly, registration: {} };`
			)
		],
		[
			'missing registration',
			dataModule(
				`export default { buildKey: "${buildKey}", root: "area", component() {}, registration: null };`
			)
		],
		['rejected import', brokenEntry]
	])('rejects a remote entry with %s', async (_name, entry) => {
		await expect(loadExactRemoteModule(entry)).rejects.toBeInstanceOf(Error);
	});

	it('loads a canonical entry client-side and renders it under the configured binding', async () => {
		const container = document.createElement('div');
		render(remoteRoot('billing'), container);

		await waitFor(() => container.textContent === 'Loaded billing');
		expect(container.querySelector('[data-exact-remote="billing"]')).not.toBeNull();
		expect(container.textContent).toBe('Loaded billing');
		unmount(container);
	});

	it('renders only the host-owned fallback for an unknown binding', async () => {
		const container = document.createElement('div');
		render(fallbackRemoteRoot('missing', 'Unavailable', true), container);

		await waitFor(() => container.textContent === 'Unavailable');
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unavailable');
		unmount(container);
	});

	it('renders the host fallback when the configured module import rejects', async () => {
		const container = document.createElement('div');
		render(fallbackRemoteRoot('broken', 'Unavailable'), container);

		await waitFor(() => container.textContent === 'Unavailable');
		expect(container.querySelector('[data-exact-remote-state="failed"]')).not.toBeNull();
		unmount(container);
	});

	it('ignores a stale module completion after the binding changes', async () => {
		const container = document.createElement('div');
		render(remoteRoot('slow'), container);
		await waitFor(
			() => typeof (globalThis as Record<string, unknown>).__releaseSlowRemote === 'function'
		);

		render(remoteRoot('billing'), container);
		await waitFor(() => container.textContent === 'Loaded billing');
		((globalThis as Record<string, unknown>).__releaseSlowRemote as () => void)();
		await Promise.resolve();
		await Promise.resolve();

		expect(container.textContent).toBe('Loaded billing');
		expect(container.querySelector('[data-exact-remote="billing"]')).not.toBeNull();
		unmount(container);
	});

	it('does not install a module that settles after its component unmounts', async () => {
		const container = document.createElement('div');
		render(remoteRoot('unmountedSlow'), container);
		await waitFor(
			() => typeof (globalThis as Record<string, unknown>).__releaseUnmountedRemote === 'function'
		);
		const remoteContainer = container.firstElementChild!;
		unmount(container);
		((globalThis as Record<string, unknown>).__releaseUnmountedRemote as () => void)();
		await Promise.resolve();
		await Promise.resolve();

		expect(container.childNodes).toHaveLength(0);
		expect(getHydrationRoot(remoteContainer)).toBeUndefined();
	});

	it('updates props without replacing the remote instance and replaces it when binding changes', async () => {
		const container = document.createElement('div');
		render(remoteRoot('billing', { label: 'First' }), container);
		await waitFor(() => container.textContent === 'First');
		const first = remoteInstance(inspectDomRoot(container), '@company/billing#./BillingArea');

		render(remoteRoot('billing', { label: 'Second' }), container);
		await waitFor(() => container.textContent === 'Second');
		expect(remoteInstance(inspectDomRoot(container), '@company/billing#./BillingArea')).toBe(first);

		render(remoteRoot('brand'), container);
		await waitFor(() => container.textContent === 'Loaded brand');
		expect(remoteInstance(inspectDomRoot(container), '@company/brand#./BrandArea')).not.toBe(first);
		unmount(container);
	});

	it('keeps page-owned children and live page context when a remote parent renders them', async () => {
		const container = document.createElement('div');
		render(shellPageRoot(), container);
		await waitFor(() => container.textContent === 'Ada');
		const tree = inspectDomRoot(container);
		expect(remoteInstance(tree, '@company/brand#./Shell')).toBeDefined();
		expect(namedInstanceRoot(tree, 'ShellPageChild')).toBe('page');

		setShellProfileName('Grace');
		await waitFor(() => container.textContent === 'Grace');
		expect(namedInstanceRoot(inspectDomRoot(container), 'ShellPageChild')).toBe('page');
		unmount(container);
	});

	it('reattaches a page-owned child after a remote protocol patch replaces its ancestor', async () => {
		const container = document.createElement('div');
		resetPatchingLifecycle();
		render(patchingPageRoot(), container);
		await waitFor(() => container.querySelector('[data-page-child]') !== null);
		const before = namedInstance(inspectDomRoot(container), 'PatchingPageChild');
		const remoteBefore = namedInstance(inspectDomRoot(container), 'PatchingShell');
		const wrapper = namedInstance(inspectDomRoot(container), 'RemoteComponent') as Component<{
			reconcile: number;
		}>;
		expect(
			findNodeOwnerInstance(container.querySelector('[data-page-child]')!)?.domain.executionRoot
		).toBe('page');
		expect(
			findNodeOwnerInstance(container.querySelector('[data-exact-id="remote-boundary"]')!)?.domain
				.executionRoot
		).toBe('@company/brand#./PatchingShell');
		const client = remoteClient(container, 'patching');
		expect(
			client.applyPatches([
				{
					type: 'replace',
					id: 'remote-boundary',
					html: '<section data-exact-id="remote-boundary"><em>server</em></section>'
				}
			])
		).toBe(true);
		expect(wrapper.state.reconcile).toBe(1);

		await waitFor(
			() =>
				namedInstance(inspectDomRoot(container), 'PatchingPageChild') === before &&
				container.querySelector('[data-page-child]') !== null
		);
		expect(namedInstance(inspectDomRoot(container), 'PatchingShell')).not.toBe(remoteBefore);
		expect(container.querySelector('[data-page-child]')).not.toBeNull();
		const child = patchingChild();
		expect(child).toBe(before);
		expect(findComponentDomNode(before!)).toBe(container.querySelector('[data-page-child]'));
		expect(container.contains(findComponentDomNode(before!))).toBe(true);
		incrementPatchingChild();
		await waitFor(() => container.querySelector('[data-page-child]')?.textContent === '1');
		expect(patchingLifecycle()).toEqual({ mounts: 1, unmounts: 0 });
		unmount(container);
	});

	it('coordinates an unsupported-build replacement through the page-owned resolver', async () => {
		stubUnsupportedBuild(replacementBuildKey);
		const container = document.createElement('div');
		render(remoteRoot('retiring'), container);
		await waitFor(() => container.textContent === 'Old remote');
		void remoteClient(container, 'retiring')
			.invokeTask('probe')
			.catch(() => undefined);

		await waitFor(() => container.textContent === 'New remote');
		expect(resolveRetiringEntry).toHaveBeenCalledTimes(1);
		expect(resolveRetiringEntry).toHaveBeenCalledWith(replacementBuildKey);
		expect(remoteInstance(inspectDomRoot(container), '@company/retiring#./Area')).toBeDefined();
		unmount(container);
	});

	it('deduplicates a preferred-build preparation and waits for participating roots to settle', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_input: string, init: { body: string }) => {
				const body = JSON.parse(init.body) as {
					type: string;
					id?: string;
					operations?: Array<{ type: string; id: string; opId?: string }>;
				};
				return {
					ok: true,
					status: 200,
					headers: new Headers({ 'X-Exact-Preferred-Build': replacementBuildKey }),
					async json() {
						if (body.type === 'batch')
							return {
								ok: true,
								version: 1,
								results: body.operations!.map((operation) => ({
									ok: true,
									type: operation.type,
									id: operation.id,
									...('opId' in operation ? { opId: operation.opId } : {})
								}))
							};
						return { ok: true, type: body.type, id: body.id };
					}
				};
			})
		);
		const container = document.createElement('div');
		render(pairedRetiringRoot(), container);
		await waitFor(() => container.textContent === 'Old remoteOld remote');
		for (const element of Array.from(container.querySelectorAll('[data-exact-remote="retiring"]')))
			void requestClient(element)
				.invokeTask('probe')
				.catch(() => undefined);

		await waitFor(() => container.textContent === 'New remoteNew remote');
		expect(resolveRetiringEntry).toHaveBeenCalledTimes(1);
		unmount(container);
	});

	it('falls back after one bounded attempt when a resolver returns the unchanged build', async () => {
		stubUnsupportedBuild(replacementBuildKey);
		const container = document.createElement('div');
		render(fallbackRemoteRoot('unchanged', 'Remote unavailable'), container);
		await waitFor(() => container.textContent === 'Old remote');
		void remoteClient(container, 'unchanged')
			.invokeTask('probe')
			.catch(() => undefined);

		await waitFor(() => container.textContent === 'Remote unavailable');
		expect(resolveUnchangedEntry).toHaveBeenCalledTimes(1);
		unmount(container);
	});

	it('falls back when the page-owned replacement resolver rejects', async () => {
		stubUnsupportedBuild(replacementBuildKey);
		const container = document.createElement('div');
		render(fallbackRemoteRoot('rejecting', 'Replacement unavailable'), container);
		await waitFor(() => container.textContent === 'Old remote');
		void remoteClient(container, 'rejecting')
			.invokeTask('probe')
			.catch(() => undefined);

		await waitFor(() => container.textContent === 'Replacement unavailable');
		expect(resolveRejectedEntry).toHaveBeenCalledTimes(1);
		unmount(container);
	});

	it('preserves a page-owned child instance across whole remote-build replacement', async () => {
		let release!: () => void;
		const responseReady = new Promise<void>((resolve) => (release = resolve));
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				await responseReady;
				return {
					ok: false,
					status: 410,
					headers: new Headers({ 'X-Exact-Preferred-Build': replacementBuildKey }),
					async json() {
						return { error: 'exact_build_unsupported' };
					}
				};
			})
		);
		const container = document.createElement('div');
		render(replacementPageRoot(), container);
		await waitFor(() => container.textContent === 'Ada:0');
		const before = namedInstance(inspectDomRoot(container), 'ReplacementPageChild');
		expect(before).toBeDefined();
		void remoteClient(container, 'retiringShell')
			.invokeTask('probe')
			.catch(() => undefined);

		release();
		await waitFor(() => namedInstance(inspectDomRoot(container), 'ReplacementShell') !== undefined);
		expect(namedInstance(inspectDomRoot(container), 'ReplacementPageChild')).toBe(before);
		updateReplacementPage('Grace', 1);
		await waitFor(() => container.textContent === 'Grace:1');
		unmount(container);
	});
});

function remoteClient(container: Element, binding: string): ExactClient {
	const root = container.querySelector(`[data-exact-remote="${binding}"]`);
	if (!root) throw new Error(`Missing remote root for binding ${binding}`);
	return requestClient(root);
}

function requestClient(root: Element): ExactClient {
	const client = getHydrationRoot(root);
	if (!client || !isExactClient(client)) throw new Error('Remote root has no request client');
	return client;
}

function isExactClient(root: CoreHydrationRoot): root is ExactClient {
	return (
		'applyPatches' in root &&
		typeof root.applyPatches === 'function' &&
		'invokeTask' in root &&
		typeof root.invokeTask === 'function' &&
		'refreshBoundary' in root &&
		typeof root.refreshBoundary === 'function' &&
		'registerComponents' in root &&
		typeof root.registerComponents === 'function'
	);
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error(`RemoteComponent did not settle: ${document.body.innerHTML}`);
}

function dataModule(source: string): string {
	return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

function remoteInstance(node: DomInspectionNode | undefined, root: string): unknown {
	if (!node) return undefined;
	if (node.instance?.domain.executionRoot === root) return node.instance;
	for (const child of node.children) {
		const found = remoteInstance(child, root);
		if (found) return found;
	}
	return undefined;
}

function namedInstanceRoot(node: DomInspectionNode | undefined, name: string): string | undefined {
	if (!node) return undefined;
	if (node.instance?.type.name === name) return node.instance.domain.executionRoot;
	for (const child of node.children) {
		const found = namedInstanceRoot(child, name);
		if (found) return found;
	}
	return undefined;
}

function namedInstance(
	node: DomInspectionNode | undefined,
	name: string
): AnyComponentInstance | undefined {
	if (!node) return undefined;
	if (node.instance?.type.name === name) return node.instance;
	for (const child of node.children) {
		const found = namedInstance(child, name);
		if (found) return found;
	}
	return undefined;
}
