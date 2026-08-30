import { createContext, type Component } from '@exactjs/core';
import { createComponentInstance, renderInstance } from '@exactjs/core/runtime/render';
import {
	readExactExecutableComponentContract,
	type AnyExactComponentCallable
} from '@exactjs/core/framework/component-contracts';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/testing';
import {
	compatibilityContributionKey,
	createCompatibilityContribution,
	placeCompatibilityContribution
} from '@exactjs/core/framework/compatibility-contributions';
import {
	createCompiledIntrinsicReceipt,
	isOpaqueOperation,
	readCompiledComponentReceipt
} from '@exactjs/core/runtime/component-operations';
import '@exactjs/core/runtime/contexts';
import { describe, expect, it } from 'vitest';
import { adaptReactComponent } from './exact.js';
import { ReactClientIsland, ReactServerIsland } from './runtime/island-artifacts.js';
import {
	Children,
	cloneElement,
	createElement,
	forwardRef,
	isValidElement,
	withReactProfile
} from './index.js';
import { HookHost } from './internals.js';
import { reactElementCompatibilityContribution } from './runtime/nodes.js';
import {
	bridgeReactContext,
	defineInteropContext,
	exactContextToken,
	exposeExactComponent,
	useExactContext
} from './interop.js';

let nextFixture = 0;
const fixture = <T extends AnyExactComponentCallable>(component: T): T =>
	createExactFrameworkFixtureArtifact(component, `@exactjs/react-compat:test:${++nextFixture}`);

describe('eXact and React context interop', () => {
	it('publishes fixed target-local island artifacts without adapting React types', () => {
		expect(ReactServerIsland).not.toBe(ReactClientIsland);
		expect(adaptReactComponent).toBe(ReactClientIsland);
		expect(readExactExecutableComponentContract(ReactClientIsland)).toMatchObject({
			placement: 'client',
			artifact: { target: 'client', abi: 30 }
		});
		expect(readExactExecutableComponentContract(ReactServerIsland)).toMatchObject({
			placement: 'server',
			artifact: {
				target: 'server',
				abi: 30,
				execution: { lane: 'compatibility' }
			}
		});
	});

	it('profiles render and commit work through an explicit compatibility scope', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];
		const component = createComponentInstance(
			fixture(function Profiled(this: Component<{}>) {
				return () => null;
			}),
			{}
		);

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
		const parent = createComponentInstance(
			fixture(function Parent(this: Component<{}>) {
				this.setContext(Service, 'native-value');
				return () => null;
			}),
			{}
		);
		const Reader = function Reader() {
			observed = useExactContext(Service);
			return null;
		};
		const child = createComponentInstance(ReactClientIsland, { component: Reader }, parent);
		renderInstance(child, () => undefined);
		expect(observed).toBe('native-value');
	});

	it('makes a bridged React provider visible to native eXact descendants', () => {
		const Service = createContext<string>('fixture.provider');
		const ReactService = bridgeReactContext(Service, 'default');
		let providerComponent!: Component<{}>;
		const provider = createComponentInstance(
			fixture(function Provider(this: Component<{}>) {
				providerComponent = this;
				return () => null;
			}),
			{}
		);
		new HookHost(providerComponent).provide(ReactService, 'react-value');
		const child = createComponentInstance(
			fixture(function Child(this: Component<{}>) {
				expect(this.getContext(Service)).toBe('react-value');
				return () => null;
			}),
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
		const Boundary = exposeExactComponent(fixture(Native));
		const contribution = reactElementCompatibilityContribution(createElement(Boundary, {}));
		let operation: unknown;
		placeCompatibilityContribution(contribution!, {
			place: (value) => (operation = value) as object
		});
		expect(isOpaqueOperation(operation)).toBe(true);
	});

	it('normalizes compiler-authored refs at a direct React adapter boundary', () => {
		const ref = { current: null };
		let observed: unknown;
		const Forwarded = forwardRef((_props, forwardedRef) => {
			observed = forwardedRef;
			return null;
		});
		const instance = createComponentInstance(ReactClientIsland, {
			component: Forwarded,
			ref
		});

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
		const instance = createComponentInstance(ReactClientIsland, {
			component: Wrapper,
			children: createCompatibilityContribution(
				(target) =>
					target.place(
						createCompiledIntrinsicReceipt('span', { key: 'native', title: 'source' }, 'child')
					),
				'native'
			)
		});

		renderInstance(instance, () => undefined);

		expect((child as { key?: string }).key).toBe('native');
		instance.unmount();
	});

	it('recognizes compiler-attached native components inside React-owned JSX', () => {
		function Native(this: Component<{}>) {
			return () => 'native';
		}
		fixture(Native);

		const reactOwnedType: import('react').JSXElementConstructor<{}> = Native;
		const contribution = reactElementCompatibilityContribution(createElement(Native, {}));
		expect(reactOwnedType).toBe(Native);
		expect(contribution).toBeDefined();
	});

	it('preserves keys, children, and explicitly forwarded refs at native boundaries', () => {
		const ref = { current: null };
		function Native(this: Component<{}>, _props: { nativeRef?: unknown; children?: unknown }) {
			return () => null;
		}
		const Boundary = exposeExactComponent(fixture(Native), 'Native', { refProp: 'nativeRef' });
		const contribution = reactElementCompatibilityContribution(
			createElement(Boundary, { key: 'stable', ref }, 'child')
		)!;
		let operation: unknown;
		placeCompatibilityContribution(contribution, {
			place: (value) => (operation = value) as object
		});
		const receipt = readCompiledComponentReceipt(operation);
		expect(compatibilityContributionKey(contribution)).toBe('stable');
		expect(receipt?.props.nativeRef).toBe(ref);
		expect(receipt?.children).toHaveLength(1);
	});

	it('preserves a custom native ref prop through the explicit native boundary', () => {
		const ref = { current: null };
		function Native(this: Component<{}>, _props: { nativeRef?: unknown }) {
			return () => null;
		}
		const Boundary = exposeExactComponent(fixture(Native), 'Native', { refProp: 'nativeRef' });
		const contribution = reactElementCompatibilityContribution(createElement(Boundary, { ref }))!;
		let operation: unknown;
		placeCompatibilityContribution(contribution, {
			place: (value) => (operation = value) as object
		});
		expect(readCompiledComponentReceipt(operation)?.props.nativeRef).toBe(ref);
	});

	it('keeps nearest-provider semantics through alternating ownership layers', () => {
		const paired = defineInteropContext('fixture.alternating', 'default');
		const root = createComponentInstance(
			fixture(function Root(this: Component<{}>) {
				this.setContext(paired.exact, 'native-root');
				return () => null;
			}),
			{}
		);
		const reactLayer = createComponentInstance(
			fixture(function Layer() {
				return () => null;
			}),
			{},
			root
		);
		const reactHost = new HookHost(reactLayer as Component<{}>);
		expect(reactHost.exactContext(paired.exact)).toBe('native-root');
		reactHost.provide(paired.react, 'react-override');
		const nativeLayer = createComponentInstance(
			fixture(function Native(this: Component<{}>) {
				expect(this.getContext(paired.exact)).toBe('react-override');
				return () => null;
			}),
			{},
			reactLayer
		);
		const finalReactLayer = createComponentInstance(
			fixture(function Layer() {
				return () => null;
			}),
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
			createComponentInstance(
				fixture(function Root(this: Component<{}>) {
					this.setContext(token, value);
					return () => null;
				}),
				{}
			);
		const left = createComponentInstance(
			fixture(function Child(this: Component<{}>) {
				return () => null;
			}),
			{},
			makeRoot(leftValue)
		);
		const right = createComponentInstance(
			fixture(function Child(this: Component<{}>) {
				return () => null;
			}),
			{},
			makeRoot(rightValue)
		);
		expect(left.getContext(token)).toBe(leftValue);
		expect(right.getContext(token)).toBe(rightValue);
	});
});
