import { flushSync, unwrap } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import {
	ErrorContext,
	LoggerContext,
	createComponentInstance,
	createContext,
	createDerived,
	createRef,
	createVNode,
	isVNode,
	renderInstance,
	type Component,
	type ComponentInstance
} from './index.js';

describe('@exactjs/core context-reactive', () => {
	it('scopes contexts to descendants and stores refs', () => {
		const token = createContext<{ name: string }>('user');
		const input = createRef<{ focus(): void }>('input');

		function Parent(this: Component<{}>) {
			this.setContext(token, { name: 'Ada' });
			return () => null;
		}

		const parent = createComponentInstance(Parent, {});
		const child = createComponentInstance(
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
		const parent = createComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(token, service);
			return () => null;
		}, {});
		createComponentInstance(
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
		const parent = createComponentInstance(function Parent(this: Component<{}>) {
			this.setContext(provided, 'ready');
			return () => null;
		}, {});
		createComponentInstance(
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

		const parent = createComponentInstance(Parent, {});
		createComponentInstance(
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
		expect(ErrorContext.reactive).toBe(false);
		expect(LoggerContext.id).toBe(Symbol.for('exact.context:exact.logger'));
		expect(ErrorContext.id).toBe(Symbol.for('exact.context:exact.error'));
	});

	it('creates a keyed list fragment through this.map', () => {
		const instance = createComponentInstance(function List(this: Component<{}>) {
			return () =>
				this.map(
					[{ id: 'a' }, { id: 'b' }],
					(item) => item.id,
					(item) => createVNode('li', null, item.id)
				);
		}, {});

		const nodes = renderInstance(instance, () => undefined);
		expect(nodes).toHaveLength(1);
		expect(isVNode(nodes[0])).toBe(true);
		expect(isVNode(nodes[0]) ? nodes[0].type : undefined).toBe(Symbol.for('exact.fragment'));
	});

	it('prevents child components from writing to parent-owned props', () => {
		function Child(this: Component<{}>, props: { text: string }) {
			return () => {
				expect(() => {
					props.text = 'changed';
				}).toThrow(TypeError);
				return createVNode('span', null, props.text);
			};
		}

		const instance = createComponentInstance(Child, { text: 'original' });
		const nodes = renderInstance(instance, () => undefined);

		expect(unwrap(isVNode(nodes[0]) ? nodes[0].children[0] : undefined)).toBe('original');
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

			return () => createVNode('span', null, label);
		}

		const component = createComponentInstance(Person, {});
		const nodes = renderInstance(component, () => undefined);

		expect(unwrap(isVNode(nodes[0]) ? nodes[0].children[0] : undefined)).toBe('Ada Lovelace');
		instance.state.formal = true;
		flushSync();
		expect(unwrap(isVNode(nodes[0]) ? nodes[0].children[0] : undefined)).toBe(
			'Countess Ada Lovelace'
		);
	});

	it('reruns tasks when reactive value dependencies change', () => {
		let instance!: Component<{ first: string; last: string }>;
		const values: string[] = [];
		const aborts: string[] = [];

		function Person(this: Component<{ first: string; last: string }>) {
			instance = this;
			this.state.first = 'Ada';
			this.state.last = 'Lovelace';
			const fullName = this.reactive(() => `${this.state.first} ${this.state.last}`);

			(this as any).task(fullName, (name: string, { signal }: { signal: AbortSignal }) => {
				values.push(String(name));
				signal.addEventListener('abort', () => aborts.push(String(name)));
			});

			return () => null;
		}

		createComponentInstance(Person, {});
		instance.state.first = 'Ada';
		flushSync();
		instance.state.last = 'Byron';
		flushSync();

		expect(values).toEqual(['Ada Lovelace', 'Ada Byron']);
		expect(aborts).toEqual(['Ada Lovelace']);
	});

	it('stops compiler-owned derived subscriptions when a component unmounts', () => {
		let instance!: ComponentInstance<{ count: number }>;
		const compute = vi.fn(() => instance.state.count * 2);

		instance = createComponentInstance(function Counter(this: Component<{ count: number }>) {
			instance = this as ComponentInstance<{ count: number }>;
			this.state.count = 1;
			const doubled = createDerived(compute);
			(this as any).task(doubled, () => undefined);
			return () => null;
		}, {});
		instance.markMounted();
		expect(compute).toHaveBeenCalledTimes(1);

		instance.unmount();
		instance.state.count = 2;
		flushSync();

		expect(compute).toHaveBeenCalledTimes(1);
	});

	it('runs fluent tasks on component reactive values', () => {
		let instance!: Component<{ query: string }>;
		const values: string[] = [];
		const aborts: string[] = [];

		function Search(this: Component<{ query: string }>) {
			instance = this;
			this.state.query = 'ada';

			(this.reactive(() => this.state.query) as any).task(
				(query: string, { signal }: { signal: AbortSignal }) => {
					values.push(String(query));
					signal.addEventListener('abort', () => aborts.push(String(query)));
				}
			);

			return () => null;
		}

		createComponentInstance(Search, {});
		instance.state.query = 'grace';
		flushSync();

		expect(values).toEqual(['ada', 'grace']);
		expect(aborts).toEqual(['ada']);
	});
});
