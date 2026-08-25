/**
 * @vitest-environment jsdom
 */
import {
	type AnyComponentInstance,
	createContext,
	createVNode,
	type Component
} from '@exactjs/core';
import { findComponentDomNode, findNodeOwnerInstance, render, unmount } from '@exactjs/dom';
import { inspectDomRoot, type DomInspectionNode } from '@exactjs/dom/testing';
import { getHydrationRoot, type CoreHydrationRoot, type ExactClient } from '@exactjs/hydrate';
import { createTestVNode } from '@exactjs/testing/internal/fixtures';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	loadExactRemoteModule,
	registerExactRemoteClientBindings,
	RemoteComponent
} from './client.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

function remoteBrand(name: string): string {
	return `Object.defineProperties(${name}, {
  [Symbol.for("@exactjs/component")]: { value: "test:${name}" },
  [Symbol.for("@exactjs/component-contract")]: { value: {
    version: 2,
    placement: "client",
    role: "client",
    implementations: [{ id: "test:${name}:implementation", name: "${name}", role: "root", implementation: ${name} }],
    continuations: [],
    executors: [],
    boundaries: [],
    execution: { version: 1, ports: [], transitions: [], reactive: [] },
    definition: {
      version: 1,
      instantiate: ${name},
      abi: 8,
      state: [],
      tasks: [],
      reactive: [],
      render: "returned-function",
      capabilities: ["interactions", "tasks"]
    }
  } }
});`;
}
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
function BillingArea(props) { return () => props.label ?? "Loaded billing"; }
${remoteBrand('BillingArea')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/billing#./BillingArea",
  component: BillingArea,
  registration: ${probeRegistration}
});`;
const clientEntry = `data:text/javascript;base64,${Buffer.from(entrySource).toString('base64')}`;
const brandSource = `
function BrandArea() { return () => "Loaded brand"; }
${remoteBrand('BrandArea')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/brand#./BrandArea",
  component: BrandArea,
  registration: ${probeRegistration}
});`;
const brandEntry = `data:text/javascript;base64,${Buffer.from(brandSource).toString('base64')}`;
const shellSource = `
function Shell(props) { return () => props.children; }
${remoteBrand('Shell')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/brand#./Shell",
  component: Shell,
  registration: ${probeRegistration}
});`;
const shellEntry = `data:text/javascript;base64,${Buffer.from(shellSource).toString('base64')}`;
const patchingSource = `
function PatchingShell(props) {
  return () => globalThis.__exactCreateVNode(
    "section",
    { "data-exact-id": "remote-boundary" },
    props.children
  );
}
${remoteBrand('PatchingShell')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/brand#./PatchingShell",
  component: PatchingShell,
  registration: ${probeRegistration}
});`;
const patchingEntry = `data:text/javascript;base64,${Buffer.from(patchingSource).toString('base64')}`;
const replacementBuildKey = '89abcdef0123456789abcdef0123456789abcdef';
const retiringSource = `
function RetiringArea() {
  return () => "Old remote";
}
${remoteBrand('RetiringArea')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/retiring#./Area",
  component: RetiringArea,
  registration: ${probeRegistration}
});`;
const retiringEntry = `data:text/javascript;base64,${Buffer.from(retiringSource).toString('base64')}`;
const replacementSource = `
function ReplacementArea() { return () => "New remote"; }
${remoteBrand('ReplacementArea')}
export default Object.freeze({
  buildKey: "${replacementBuildKey}",
  root: "@company/retiring#./Area",
  component: ReplacementArea,
  registration: ${probeRegistration}
});`;
const replacementEntry = `data:text/javascript;base64,${Buffer.from(replacementSource).toString('base64')}`;
const resolveRetiringEntry = vi.fn(async () => replacementEntry);
const retiringShellSource = `
function RetiringShell(props) {
  return () => props.children;
}
${remoteBrand('RetiringShell')}
export default Object.freeze({
  buildKey: "${buildKey}",
  root: "@company/retiring#./Shell",
  component: RetiringShell,
  registration: ${probeRegistration}
});`;
const retiringShellEntry = `data:text/javascript;base64,${Buffer.from(retiringShellSource).toString('base64')}`;
const replacementShellSource = `
function ReplacementShell(props) { return () => props.children; }
${remoteBrand('ReplacementShell')}
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

function stubUnsupportedBuild(): void {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: false,
			status: 410,
			headers: new Headers({ 'X-Exact-Preferred-Build': replacementBuildKey }),
			async json() {
				return { error: 'exact_build_unsupported' };
			}
		}))
	);
}

describe('RemoteComponent', () => {
	beforeAll(() => registerExactRemoteClientBindings(bindings));
	afterEach(() => {
		delete (globalThis as Record<string, unknown>).__exactCreateVNode;
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
		render(createVNode(RemoteComponent, { binding: 'billing' }), container);

		await waitFor(() => container.textContent === 'Loaded billing');
		expect(container.querySelector('[data-exact-remote="billing"]')).not.toBeNull();
		expect(container.textContent).toBe('Loaded billing');
		unmount(container);
	});

	it('renders only the host-owned fallback for an unknown binding', async () => {
		const container = document.createElement('div');
		render(
			createVNode(RemoteComponent, {
				binding: 'missing',
				fallback: createVNode('p', { role: 'alert' }, 'Unavailable')
			}),
			container
		);

		await waitFor(() => container.textContent === 'Unavailable');
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('Unavailable');
		unmount(container);
	});

	it('renders the host fallback when the configured module import rejects', async () => {
		const container = document.createElement('div');
		render(
			createVNode(RemoteComponent, {
				binding: 'broken',
				fallback: createVNode('p', null, 'Unavailable')
			}),
			container
		);

		await waitFor(() => container.textContent === 'Unavailable');
		expect(container.querySelector('[data-exact-remote-state="failed"]')).not.toBeNull();
		unmount(container);
	});

	it('ignores a stale module completion after the binding changes', async () => {
		const container = document.createElement('div');
		render(createVNode(RemoteComponent, { binding: 'slow' }), container);
		await waitFor(
			() => typeof (globalThis as Record<string, unknown>).__releaseSlowRemote === 'function'
		);

		render(createVNode(RemoteComponent, { binding: 'billing' }), container);
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
		render(createVNode(RemoteComponent, { binding: 'unmountedSlow' }), container);
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
		render(
			createVNode(RemoteComponent, { binding: 'billing', props: { label: 'First' } }),
			container
		);
		await waitFor(() => container.textContent === 'First');
		const first = remoteInstance(inspectDomRoot(container), '@company/billing#./BillingArea');

		render(
			createVNode(RemoteComponent, { binding: 'billing', props: { label: 'Second' } }),
			container
		);
		await waitFor(() => container.textContent === 'Second');
		expect(remoteInstance(inspectDomRoot(container), '@company/billing#./BillingArea')).toBe(first);

		render(createVNode(RemoteComponent, { binding: 'brand' }), container);
		await waitFor(() => container.textContent === 'Loaded brand');
		expect(remoteInstance(inspectDomRoot(container), '@company/brand#./BrandArea')).not.toBe(first);
		unmount(container);
	});

	it('keeps page-owned children and live page context when a remote parent renders them', async () => {
		const container = document.createElement('div');
		const Profile = createContext<{ name: string }>('remote-test-profile', {
			global: false,
			reactive: true
		});
		let page!: Component<{ profile: { name: string } }>;
		function PageChild(this: Component<{}>) {
			const profile = this.getContext(Profile);
			return () => createVNode('strong', null, profile.name);
		}
		function Page(this: Component<{ profile: { name: string } }>) {
			page = this;
			this.state.profile = { name: 'Ada' };
			this.setContext(Profile, this.state.profile);
			return () =>
				createVNode(RemoteComponent, { binding: 'shell' }, createTestVNode(PageChild, null));
		}

		render(createTestVNode(Page, null), container);
		await waitFor(() => container.textContent === 'Ada');
		const tree = inspectDomRoot(container);
		expect(remoteInstance(tree, '@company/brand#./Shell')).toBeDefined();
		expect(namedInstanceRoot(tree, 'PageChild')).toBe('page');

		page.state.profile.name = 'Grace';
		await waitFor(() => container.textContent === 'Grace');
		expect(namedInstanceRoot(inspectDomRoot(container), 'PageChild')).toBe('page');
		unmount(container);
	});

	it('reattaches a page-owned child after a remote protocol patch replaces its ancestor', async () => {
		const container = document.createElement('div');
		let mounts = 0;
		let unmounts = 0;
		let child!: Component<{ count: number }>;
		function PageChild(this: Component<{ count: number }>) {
			child = this;
			this.state.count = 0;
			this.onMount(() => mounts++);
			this.onUnmount(() => unmounts++);
			return () => createVNode('strong', { 'data-page-child': '' }, this.state.count);
		}
		function Page() {
			return () =>
				createVNode(RemoteComponent, { binding: 'patching' }, createTestVNode(PageChild, null));
		}

		(globalThis as Record<string, unknown>).__exactCreateVNode = createVNode;
		render(createTestVNode(Page, null), container);
		await waitFor(() => container.querySelector('[data-page-child]') !== null);
		const before = namedInstance(inspectDomRoot(container), 'PageChild');
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
				namedInstance(inspectDomRoot(container), 'PageChild') === before &&
				container.querySelector('[data-page-child]') !== null
		);
		expect(namedInstance(inspectDomRoot(container), 'PatchingShell')).not.toBe(remoteBefore);
		expect(container.querySelector('[data-page-child]')).not.toBeNull();
		expect(child).toBe(before);
		expect(findComponentDomNode(before!)).toBe(container.querySelector('[data-page-child]'));
		expect(container.contains(findComponentDomNode(before!))).toBe(true);
		child.state.count++;
		await waitFor(() => container.querySelector('[data-page-child]')?.textContent === '1');
		expect(mounts).toBe(1);
		expect(unmounts).toBe(0);
		unmount(container);
	});

	it('coordinates an unsupported-build replacement through the page-owned resolver', async () => {
		stubUnsupportedBuild();
		const container = document.createElement('div');
		render(createVNode(RemoteComponent, { binding: 'retiring' }), container);
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
		render(
			createVNode(
				'div',
				null,
				createVNode(RemoteComponent, { binding: 'retiring', key: 'left' }),
				createVNode(RemoteComponent, { binding: 'retiring', key: 'right' })
			),
			container
		);
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
		stubUnsupportedBuild();
		const container = document.createElement('div');
		render(
			createVNode(RemoteComponent, {
				binding: 'unchanged',
				fallback: createVNode('p', null, 'Remote unavailable')
			}),
			container
		);
		await waitFor(() => container.textContent === 'Old remote');
		void remoteClient(container, 'unchanged')
			.invokeTask('probe')
			.catch(() => undefined);

		await waitFor(() => container.textContent === 'Remote unavailable');
		expect(resolveUnchangedEntry).toHaveBeenCalledTimes(1);
		unmount(container);
	});

	it('falls back when the page-owned replacement resolver rejects', async () => {
		stubUnsupportedBuild();
		const container = document.createElement('div');
		render(
			createVNode(RemoteComponent, {
				binding: 'rejecting',
				fallback: createVNode('p', null, 'Replacement unavailable')
			}),
			container
		);
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
		const Profile = createContext<{ name: string }>('replacement-profile', {
			global: false,
			reactive: true
		});
		let page!: Component<{ profile: { name: string } }>;
		let pageChild!: Component<{ count: number }>;
		function PageChild(this: Component<{ count: number }>) {
			pageChild = this;
			this.state.count = 0;
			const profile = this.getContext(Profile);
			return () => createVNode('strong', null, `${profile.name}:${this.state.count}`);
		}
		function Page(this: Component<{ profile: { name: string } }>) {
			page = this;
			this.state.profile = { name: 'Ada' };
			this.setContext(Profile, this.state.profile);
			return () =>
				createVNode(
					RemoteComponent,
					{ binding: 'retiringShell' },
					createTestVNode(PageChild, null)
				);
		}
		render(createTestVNode(Page, null), container);
		await waitFor(() => container.textContent === 'Ada:0');
		const before = namedInstance(inspectDomRoot(container), 'PageChild');
		expect(before).toBeDefined();
		void remoteClient(container, 'retiringShell')
			.invokeTask('probe')
			.catch(() => undefined);

		release();
		await waitFor(() => namedInstance(inspectDomRoot(container), 'ReplacementShell') !== undefined);
		expect(namedInstance(inspectDomRoot(container), 'PageChild')).toBe(before);
		page.state.profile.name = 'Grace';
		pageChild.state.count++;
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
