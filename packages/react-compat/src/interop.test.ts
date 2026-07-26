import {
	createComponentInstance,
	createContext,
	createVNode,
	exactComponentContract,
	renderInstance,
	type Component
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { adaptReactComponent } from './exact.js';
import {
	Children,
	cloneElement,
	createElement,
	forwardRef,
	isValidElement,
	withReactProfile
} from './index.js';
import { HookHost, toExactNode } from './internals.js';
import {
	bridgeReactContext,
	defineInteropContext,
	exactContextToken,
	exposeExactComponent,
	useExactContext
} from './interop.js';

describe('eXact and React context interop', () => {
	it('profiles render and commit work through an explicit compatibility scope', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];
		const component = createComponentInstance(function Profiled(this: Component<{}>) {
			return () => null;
		}, {});

		withReactProfile(
			(event) => events.push(event),
			() => {
				const host = new HookHost(component as Component<{}>);
				host.render(() => null);
				host.mount();
				host.dispose();
			}
		);

		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ subsystem: 'react-compat', phase: 'render' }),
				expect.objectContaining({ subsystem: 'react-compat', phase: 'commit' })
			])
		);
	});

	it('lets React compatibility hooks consume a native ancestor context', () => {
		const Service = createContext<string>('fixture.service');
		let observed: string | undefined;
		const parent = createComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(Service, 'native-value');
			return () => null;
		}, {});
		const Reader = adaptReactComponent(function Reader() {
			observed = useExactContext(Service);
			return null;
		});
		const child = createComponentInstance(Reader, {}, parent);
		renderInstance(child, () => undefined);
		expect(observed).toBe('native-value');
	});

	it('makes a bridged React provider visible to native eXact descendants', () => {
		const Service = createContext<string>('fixture.provider');
		const ReactService = bridgeReactContext(Service, 'default');
		let providerComponent!: Component<{}>;
		const provider = createComponentInstance(function Provider(this: Component<{}>) {
			providerComponent = this;
			return () => null;
		}, {});
		new HookHost(providerComponent).provide(ReactService, 'react-value');
		const child = createComponentInstance(
			function Child(this: Component<{}>) {
				expect(this.getContext(Service)).toBe('react-value');
				return () => null;
			},
			{},
			provider
		);
		expect(child.getContext(Service)).toBe('react-value');
		expect(exactContextToken(ReactService)).toBe(Service);
	});

	it('defines paired identities and rejects extracting private React tokens', () => {
		const paired = defineInteropContext('fixture.paired', 0, { global: true });
		expect(exactContextToken(paired.react)).toBe(paired.exact);
		expect(() => exactContextToken({ _exactContextMode: 'cell' } as never)).toThrow(
			/not created with bridgeReactContext/
		);
	});

	it('mounts explicitly exposed native components instead of invoking them as React functions', () => {
		function Native(this: Component<{}>) {
			return () => 'native';
		}
		const Boundary = exposeExactComponent(Native);
		const vnode = toExactNode(createElement(Boundary, {}));
		expect(Array.isArray(vnode)).toBe(false);
		expect((vnode as { type: unknown }).type).toBe(Native);
		expect(adaptReactComponent(Boundary)).toBe(Native);
	});

	it('normalizes compiler-authored refs at a direct React adapter boundary', () => {
		const ref = { current: null };
		let observed: unknown;
		const Forwarded = forwardRef((_props, forwardedRef) => {
			observed = forwardedRef;
			return null;
		});
		const instance = createComponentInstance(adaptReactComponent(Forwarded), { ref });

		renderInstance(instance, () => undefined);

		expect(observed).toBe(ref);
		instance.unmount();
	});

	it('projects native children as inspectable React elements', () => {
		let child: unknown;
		function Wrapper(props: { children?: unknown }) {
			child = Children.only(props.children as never);
			expect(isValidElement(child)).toBe(true);
			return cloneElement(child as never, { title: 'wrapped' });
		}
		const instance = createComponentInstance(adaptReactComponent(Wrapper), {
			children: createVNode('span', { key: 'native', title: 'source' }, 'child')
		});

		renderInstance(instance, () => undefined);

		expect((child as { key?: string }).key).toBe('native');
		instance.unmount();
	});

	it('recognizes compiler-attached native components inside React-owned JSX', () => {
		function Native(this: Component<{}>) {
			return () => 'native';
		}
		Object.assign(Native, {
			[exactComponentContract]: {
				version: 1,
				id: 'fixture.native',
				placement: 'client',
				role: 'client',
				implementations: [],
				continuations: [],
				executors: [],
				boundaries: []
			}
		});

		const reactOwnedType: import('react').JSXElementConstructor<{}> = Native;
		const vnode = toExactNode(createElement(Native, {}));
		expect(reactOwnedType).toBe(Native);
		expect((vnode as { type: unknown }).type).toBe(Native);
		expect(adaptReactComponent(Native)).toBe(Native);
	});

	it('preserves keys, children, and explicitly forwarded refs at native boundaries', () => {
		const ref = { current: null };
		function Native(this: Component<{}>, _props: { nativeRef?: unknown; children?: unknown }) {
			return () => null;
		}
		const Boundary = exposeExactComponent(Native, 'Native', { refProp: 'nativeRef' });
		const vnode = toExactNode(createElement(Boundary, { key: 'stable', ref }, 'child')) as {
			key?: string;
			props: Record<string, unknown>;
		};
		expect(vnode.key).toBe('stable');
		expect(vnode.props.nativeRef).toBe(ref);
		expect(vnode.props.children).toBe('child');
	});

	it('preserves a custom native ref prop through explicit double adaptation', () => {
		const ref = { current: null };
		function Native(this: Component<{}>, _props: { nativeRef?: unknown }) {
			return () => null;
		}
		const Boundary = exposeExactComponent(Native, 'Native', { refProp: 'nativeRef' });
		const adapter = adaptReactComponent(Boundary);
		const instance = createComponentInstance(adapter, { ref });
		const rendered = renderInstance(instance, () => undefined);
		const vnode = rendered[0] as { props: Record<string, unknown> };

		expect(adapter).not.toBe(Native);
		expect(vnode.props.nativeRef).toBe(ref);
		instance.unmount();
	});

	it('keeps nearest-provider semantics through alternating ownership layers', () => {
		const paired = defineInteropContext('fixture.alternating', 'default');
		const root = createComponentInstance(function Root(this: Component<{}>) {
			this.setContext(paired.exact, 'native-root');
			return () => null;
		}, {});
		const reactLayer = createComponentInstance(
			function Layer() {
				return () => null;
			},
			{},
			root
		);
		const reactHost = new HookHost(reactLayer as Component<{}>);
		expect(reactHost.exactContext(paired.exact)).toBe('native-root');
		reactHost.provide(paired.react, 'react-override');
		const nativeLayer = createComponentInstance(
			function Native(this: Component<{}>) {
				expect(this.getContext(paired.exact)).toBe('react-override');
				return () => null;
			},
			{},
			reactLayer
		);
		const finalReactLayer = createComponentInstance(
			function Layer() {
				return () => null;
			},
			{},
			nativeLayer
		);
		expect(new HookHost(finalReactLayer as Component<{}>).exactContext(paired.exact)).toBe(
			'react-override'
		);
	});

	it('does not leak service values between roots', () => {
		const token = createContext<object>('fixture.root-local', { reactive: false });
		const leftValue = {};
		const rightValue = {};
		const makeRoot = (value: object) =>
			createComponentInstance(function Root(this: Component<{}>) {
				this.setContext(token, value);
				return () => null;
			}, {});
		const left = createComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			makeRoot(leftValue)
		);
		const right = createComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			makeRoot(rightValue)
		);
		expect(left.getContext(token)).toBe(leftValue);
		expect(right.getContext(token)).toBe(rightValue);
	});
});
