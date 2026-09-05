import { createFrameworkFixtureComponentInstance } from './testing.js';
import { flushSync, reactive, unwrap } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import {
	ErrorContext,
	LoggerContext,
	ReadinessContext,
	SuspensionContext,
	createContext,
	createRef,
	type Component
} from './index.js';
import { mapExactCompiledKeyedChildren } from './runtime/lists.js';
import './runtime/refs.js';
import { executeCompiledComponentOutput } from './component/compiled-output.js';
import {
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt
} from './component-abi/intrinsic-receipt.js';

describe('@exactjs/core context-reactive', () => {
	it('scopes contexts to descendants and stores refs', () => {
		const token = createContext<{ name: string }>('user');
		const input = createRef<{ focus(): void }>('input');

		function Parent(this: Component<{}>) {
			this.setContext(token, { name: 'Ada' });
			return () => null;
		}

		const parent = createFrameworkFixtureComponentInstance(Parent, {});
		const child = createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				const binding = this.ref(input);
				binding.fulfill({ focus() {} });
				expect(unwrap(this.getContext(token).name)).toBe('Ada');
				return () => null;
			},
			{},
			parent
		);

		expect(child.refs.get(input)).toBeDefined();
	});

	it('keeps context tokens local by default', () => {
		const first = createContext<{ name: string }>('com.example.user');
		const second = createContext<{ name: string }>('com.example.user');

		expect(first.id).not.toBe(second.id);
		expect(first.global).toBe(false);
		expect(second.global).toBe(false);
	});

	it('preserves opaque service identity for non-reactive contexts', () => {
		class Service {
			#value = 7;
			read() {
				return this.#value;
			}
		}
		const token = createContext<Service>('service', { reactive: false });
		const service = new Service();
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(token, service);
			return () => null;
		}, {});
		createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				const received = this.getContext(token);
				expect(received).toBe(service);
				expect(received.read()).toBe(7);
				return () => null;
			},
			{},
			parent
		);
	});

	it('checks optional context presence without masking lookup failures', () => {
		const provided = createContext<string>('provided', { reactive: false });
		const missing = createContext<string>('missing', { reactive: false });
		const parent = createFrameworkFixtureComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(provided, 'ready');
			return () => null;
		}, {});
		createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				expect(this.hasContext(provided)).toBe(true);
				expect(this.hasContext(missing)).toBe(false);
				expect(this.getContext(provided)).toBe('ready');
				return () => null;
			},
			{},
			parent
		);
	});

	it('can create global context tokens for cross-bundle identity', () => {
		const providerToken = createContext<{ name: string }>('com.example.user', true);
		const consumerToken = createContext<{ name: string }>('com.example.user', true);

		function Parent(this: Component<{}>) {
			this.setContext(providerToken, { name: 'Ada' });
			return () => null;
		}

		const parent = createFrameworkFixtureComponentInstance(Parent, {});
		createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				expect(unwrap(this.getContext(consumerToken).name)).toBe('Ada');
				return () => null;
			},
			{},
			parent
		);

		expect(providerToken.id).toBe(consumerToken.id);
		expect(providerToken.global).toBe(true);
		expect(consumerToken.global).toBe(true);
	});

	it('uses global identity for built-in framework contexts', () => {
		expect(LoggerContext.global).toBe(true);
		expect(ErrorContext.global).toBe(true);
		expect(SuspensionContext.global).toBe(true);
		expect(ReadinessContext.global).toBe(true);
		expect(ErrorContext.reactive).toBe(false);
		expect(LoggerContext.id).toBe(Symbol.for('exact.context:exact.logger'));
		expect(ErrorContext.id).toBe(Symbol.for('exact.context:exact.error'));
		expect(SuspensionContext.id).toBe(Symbol.for('exact.context:exact.suspension'));
		expect(ReadinessContext.id).toBe(Symbol.for('exact.context:exact.readiness'));
	});

	it('publishes direct compiler-keyed lanes from the component-local cache', () => {
		const items = [{ id: 'a' }, { id: 'b' }];
		const instance = createFrameworkFixtureComponentInstance(function List(this: Component<{}>) {
			return () =>
				mapExactCompiledKeyedChildren(
					this,
					items,
					(item) => item.id,
					(item) => createCompiledIntrinsicReceipt('li', null, item.id),
					'fixture:direct-list'
				);
		}, {});

		const first = executeCompiledComponentOutput(instance);
		const second = executeCompiledComponentOutput(instance);

		expect(second).toEqual(first);
		expect(second[0]).toBe(first[0]);
		expect(second[1]).toBe(first[1]);
	});

	it('reuses direct keyed operations across collection-specific reactive proxies', () => {
		const raw = [{ id: 'a' }, { id: 'b' }];
		let items = reactive([...raw]);
		let renders = 0;
		const instance = createFrameworkFixtureComponentInstance(function List(this: Component<{}>) {
			return () =>
				mapExactCompiledKeyedChildren(
					this,
					items,
					(item) => item.id,
					(item) => {
						renders++;
						return createCompiledIntrinsicReceipt('li', null, item.id);
					},
					'fixture:reactive-direct-list'
				);
		}, {});

		const first = executeCompiledComponentOutput(instance);
		items = reactive([...raw].reverse());
		const second = executeCompiledComponentOutput(instance);

		expect(renders).toBe(2);
		expect(second[0]).toBe(first[1]);
		expect(second[1]).toBe(first[0]);
	});

	it('prevents child components from writing to parent-owned props', () => {
		function Child(this: Component<{}>, props: { text: string }) {
			return () => {
				expect(() => {
					props.text = 'changed';
				}).toThrow(TypeError);
				return createCompiledIntrinsicReceipt('span', null, props.text);
			};
		}

		const instance = createFrameworkFixtureComponentInstance(Child, { text: 'original' });
		const nodes = executeCompiledComponentOutput(instance);

		expect(unwrap(readCompiledIntrinsicReceipt(nodes[0])?.children[0])).toBe('original');
	});

	it('creates reactive template and lambda values on component instances', () => {
		let instance!: Component<{ first: string; last: string; formal: boolean }>;

		function Person(this: Component<{ first: string; last: string; formal: boolean }>) {
			instance = this;
			this.state.first = 'Ada';
			this.state.last = 'Lovelace';
			this.state.formal = false;

			const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);
			const label = this.reactive(() =>
				this.state.formal == true ? `Countess ${fullName}` : fullName
			);

			return () => createCompiledIntrinsicReceipt('span', null, label);
		}

		const component = createFrameworkFixtureComponentInstance(Person, {});
		const nodes = executeCompiledComponentOutput(component);

		expect(unwrap(readCompiledIntrinsicReceipt(nodes[0])?.children[0])).toBe('Ada Lovelace');
		instance.state.formal = true;
		flushSync();
		expect(unwrap(readCompiledIntrinsicReceipt(nodes[0])?.children[0])).toBe(
			'Countess Ada Lovelace'
		);
	});
});
import './runtime/contexts.js';
