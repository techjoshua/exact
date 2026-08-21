/**
 * @vitest-environment jsdom
 */
import './structural-boundaries.js';
import { Suspense, type Component } from '@exactjs/core';
import { createCompiledComponentRegistry } from '@exactjs/core/runtime/registry';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';

import { render, unmount } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

const registrySetups: string[] = [];
const registryUnmounts: string[] = [];

function RegistryIdentityEntry(this: Component<Record<string, never>>, props: { label: string }) {
	registrySetups.push(props.label);
	this.onUnmount(() => registryUnmounts.push(props.label));
	return () => <p>{props.label}</p>;
}

function ComfortableRegistryIdentityEntry(
	this: Component<Record<string, never>>,
	props: { label: string }
) {
	registrySetups.push(`comfortable:${props.label}`);
	this.onUnmount(() => registryUnmounts.push(`comfortable:${props.label}`));
	return () => <p>comfortable:{props.label}</p>;
}

markExactComponent(RegistryIdentityEntry, '@exactjs/dom:test:RegistryIdentityEntry');
markExactComponent(
	ComfortableRegistryIdentityEntry,
	'@exactjs/dom:test:ComfortableRegistryIdentityEntry'
);

const IdentityView = createCompiledComponentRegistry('test:identity', 'IdentityView', 'client', () => ({
	compact: RegistryIdentityEntry,
	comfortable: ComfortableRegistryIdentityEntry
}));

let identityApp!: Component<{
	selected: 'compact' | 'comfortable';
	label: string;
}>;

function RegistryIdentityApp(
	this: Component<{ selected: 'compact' | 'comfortable'; label: string }>
) {
	identityApp = this;
	this.state.selected = 'compact';
	this.state.label = 'first';
	return () => {
		// Compiler coverage separately proves that the proposal's setup-local
		// selector lowers to this same reactive render-time lookup.
		const Current = IdentityView[this.state.selected];
		return (
			<>
				<span>{this.state.selected}</span>
				<Current label={this.state.label} />
			</>
		);
	};
}

describe('@exactjs/dom component registries', () => {
	it('retains same-key identity and replaces different keys even for one underlying component', () => {
		registrySetups.length = 0;
		registryUnmounts.length = 0;
		const container = document.createElement('div');
		render(createVNode(RegistryIdentityApp, null), container);

		identityApp.state.label = 'updated';
		flushSync();
		expect(container.textContent).toBe('compactupdated');
		expect(registrySetups).toEqual(['first']);

		identityApp.state.selected = 'comfortable';
		flushSync();
		expect(container.textContent).toBe('comfortablecomfortable:updated');
		expect(registrySetups).toEqual(['first', 'comfortable:updated']);
		expect(registryUnmounts).toEqual(['updated']);
		unmount(container);
	});

	it('deduplicates a lazy selection load across concurrent registry consumers', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const load = vi.fn(async () => {
			await gate;
			return markExactComponent(function Lazy(this: Component<Record<string, never>>) {
				return () => <p>loaded</p>;
			}, '@exactjs/dom:test:ConcurrentLazy');
		});
		const View = createCompiledComponentRegistry(
			'test:concurrent',
			'ConcurrentView',
			'client',
			({ lazy }) => ({
				lazy: lazy(load)
			})
		);
		const container = document.createElement('div');
		render(
			createVNode(Suspense, { fallback: <p>loading</p> }, <View.lazy />, <View.lazy />),
			container
		);

		expect(container.textContent).toBe('loading');
		release();
		await vi.waitFor(() => expect(container.textContent).toBe('loadedloaded'));
		expect(load).toHaveBeenCalledTimes(1);
		unmount(container);
	});

	it('treats registry keys as identity even when they share one component implementation', () => {
		const setups: string[] = [];
		const disposals: string[] = [];
		function Shared(this: Component<Record<string, never>>, props: { registryKey: string }) {
			setups.push(props.registryKey);
			this.onUnmount(() => disposals.push(props.registryKey));
			return () => <p>{props.registryKey}</p>;
		}
		markExactComponent(Shared, '@exactjs/dom:test:SharedRegistryEntry');
		const View = createCompiledComponentRegistry('test:shared', 'SharedView', 'client', () => ({
			first: Shared,
			second: Shared
		}));
		let app!: Component<{ selected: 'first' | 'second' }>;
		function App(this: Component<{ selected: 'first' | 'second' }>) {
			app = this;
			this.state.selected = 'first';
			return () => {
				const Current = View[this.state.selected];
				return <Current registryKey={this.state.selected} />;
			};
		}
		const container = document.createElement('div');
		render(createVNode(App, null), container);
		app.state.selected = 'second';
		flushSync();

		expect(setups).toEqual(['first', 'second']);
		expect(disposals).toEqual(['first']);
		expect(container.textContent).toBe('second');
		unmount(container);
	});

	it('discards stale lazy candidates during rapid selection changes', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const lazySetups = vi.fn();
		const load = vi.fn(async () => {
			await gate;
			return markExactComponent(function Lazy() {
				lazySetups();
				return () => <p>lazy</p>;
			}, '@exactjs/dom:test:StaleLazy');
		});
		function Ready() {
			return () => <p>ready</p>;
		}
		markExactComponent(Ready, '@exactjs/dom:test:ReadyRegistryEntry');
		const View = createCompiledComponentRegistry('test:stale', 'StaleView', 'client', ({ lazy }) => ({
			lazy: lazy(load),
			ready: Ready
		}));
		let app!: Component<{ selected: 'lazy' | 'ready' }>;
		function App(this: Component<{ selected: 'lazy' | 'ready' }>) {
			app = this;
			this.state.selected = 'lazy';
			return () => {
				const Current = View[this.state.selected];
				return createVNode(Suspense, { fallback: <p>loading</p> }, createVNode(Current, null));
			};
		}
		const container = document.createElement('div');
		render(createVNode(App, null), container);
		expect(container.textContent).toBe('loading');

		app.state.selected = 'ready';
		flushSync();
		expect(container.textContent).toBe('ready');
		release();
		await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
		await Promise.resolve();
		expect(container.textContent).toBe('ready');
		expect(lazySetups).not.toHaveBeenCalled();

		app.state.selected = 'lazy';
		flushSync();
		await vi.waitFor(() => expect(container.textContent).toBe('lazy'));
		expect(lazySetups).toHaveBeenCalledTimes(1);
		unmount(container);
	});
});
