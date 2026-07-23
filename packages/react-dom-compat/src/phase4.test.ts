/**
 * @vitest-environment jsdom
 */
import {
	Component,
	Fragment,
	Profiler,
	PureComponent,
	act,
	createContext,
	createElement,
	createRef
} from '@exactjs/react-compat';
import { exactComponentForReactInstance } from '@exactjs/react-compat/exact';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from './client.js';
import { findDOMNode, hydrate, render as legacyRender, unmountComponentAtNode } from './index.js';

describe('React compatibility Phase 4', () => {
	it('preserves class identity, state, context, refs, and update lifecycles', async () => {
		const events: string[] = [];
		const Tone = createContext('default');
		class Counter extends Component<{ label: string }, { count: number }> {
			static contextType = Tone;
			declare context: string;
			constructor(props: { label: string }) {
				super(props);
				this.state = { count: 0 };
				events.push(`constructor:${props.label}`);
			}
			componentDidMount() {
				events.push(`mount:${this.context}`);
			}
			getSnapshotBeforeUpdate(_props: { label: string }, state: { count: number }) {
				return `snapshot:${state.count}`;
			}
			componentDidUpdate(props: { label: string }, state: { count: number }, snapshot: string) {
				events.push(`update:${props.label}:${state.count}:${snapshot}`);
			}
			componentWillUnmount() {
				events.push('unmount');
			}
			render() {
				return createElement(
					'button',
					{
						onClick: () =>
							this.setState(
								(value) => ({ count: value.count + 1 }),
								() => events.push('callback')
							)
					},
					`${this.props.label}/${this.state.count}/${this.context}`
				);
			}
		}
		const ref = createRef<Counter>();
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() =>
			root.render(
				createElement(
					Tone.Provider,
					{ value: 'dark' },
					createElement(Counter, { ref, label: 'first' })
				)
			)
		);
		expect(container.textContent).toBe('first/0/dark');
		expect(ref.current).toBeInstanceOf(Counter);
		await act(() => container.querySelector('button')!.click());
		expect(container.textContent).toBe('first/1/dark');
		expect(events).toContain('update:first:0:snapshot:0');
		expect(events).toContain('callback');
		await act(() =>
			root.render(
				createElement(
					Tone.Provider,
					{ value: 'light' },
					createElement(Counter, { ref, label: 'second' })
				)
			)
		);
		expect(container.textContent).toBe('second/1/light');
		expect(events.filter((event) => event.startsWith('constructor'))).toHaveLength(1);
		root.unmount();
		expect(ref.current).toBeNull();
		expect(events).toContain('unmount');
	});

	it('honors shouldComponentUpdate, forceUpdate, and PureComponent shallow comparison', async () => {
		const renders = vi.fn();
		class Controlled extends Component<{ value: number }> {
			shouldComponentUpdate(next: { value: number }) {
				return next.value % 2 === 0;
			}
			render() {
				renders(this.props.value);
				return createElement('span', null, String(this.props.value));
			}
		}
		const ref = createRef<Controlled>();
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(Controlled, { ref, value: 1 })));
		await act(() => root.render(createElement(Controlled, { ref, value: 3 })));
		expect(container.textContent).toBe('1');
		await act(() => ref.current!.forceUpdate());
		expect(container.textContent).toBe('3');

		const pureRenders = vi.fn();
		class PureLabel extends PureComponent<{ value: number }> {
			render() {
				pureRenders();
				return createElement('b', null, String(this.props.value));
			}
		}
		await act(() => root.render(createElement(PureLabel, { value: 1 })));
		await act(() => root.render(createElement(PureLabel, { value: 1 })));
		await act(() => root.render(createElement(PureLabel, { value: 2 })));
		expect(pureRenders).toHaveBeenCalledTimes(2);
	});

	it('routes descendant errors to class boundaries without letting a boundary catch itself', async () => {
		const caught = vi.fn();
		class Boundary extends Component<{ children?: unknown }, { error: Error | null }> {
			state = { error: null as Error | null };
			static getDerivedStateFromError(error: Error) {
				return { error };
			}
			componentDidCatch(error: Error, info: { componentStack: string }) {
				caught(error.message, info.componentStack);
			}
			render() {
				return this.state.error
					? createElement('strong', null, this.state.error.message)
					: (this.props.children as never);
			}
		}
		function Broken(): never {
			throw new Error('child failed');
		}
		const container = document.createElement('div');
		await act(() =>
			createRoot(container).render(createElement(Boundary, null, createElement(Broken, null)))
		);
		expect(container.textContent).toBe('child failed');
		expect(caught).toHaveBeenCalledTimes(1);

		class SelfBrokenBoundary extends Boundary {
			render(): never {
				throw new Error('boundary failed');
			}
		}
		const nested = document.createElement('div');
		await act(() =>
			createRoot(nested).render(
				createElement(Boundary, null, createElement(SelfBrokenBoundary, null))
			)
		);
		expect(nested.textContent).toBe('boundary failed');
	});

	it('reports Profiler mount and update commits', async () => {
		const onRender = vi.fn();
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() =>
			root.render(
				createElement(Profiler, { id: 'profile', onRender }, createElement('span', null, 'first'))
			)
		);
		await act(() =>
			root.render(
				createElement(Profiler, { id: 'profile', onRender }, createElement('span', null, 'second'))
			)
		);
		expect(onRender.mock.calls.map((call) => call.slice(0, 2))).toEqual([
			['profile', 'mount'],
			['profile', 'update']
		]);
	});

	it('supports React 18 legacy render, hydrate fallback, and unmount entrypoints', () => {
		const callback = vi.fn();
		const container = document.createElement('div');
		expect(legacyRender(createElement('span', null, 'legacy'), container, callback)).toBeNull();
		expect(container.textContent).toBe('legacy');
		expect(callback).toHaveBeenCalledTimes(1);
		hydrate(createElement('span', null, 'hydrated-fallback'), container);
		expect(container.textContent).toBe('hydrated-fallback');
		expect(unmountComponentAtNode(container)).toBe(true);
		expect(container.textContent).toBe('');
		expect(unmountComponentAtNode(container)).toBe(false);
	});

	it('propagates legacy child context through class components', async () => {
		class Provider extends Component<{ children?: unknown }> {
			static childContextTypes = { tone: () => null };
			getChildContext() {
				return { tone: 'legacy-dark' };
			}
			render() {
				return this.props.children as never;
			}
		}
		class Reader extends Component {
			static contextTypes = { tone: () => null };
			declare context: { tone?: string };
			render() {
				return createElement('span', null, this.context.tone);
			}
		}
		const container = document.createElement('div');
		await act(() =>
			createRoot(container).render(createElement(Provider, null, createElement(Reader, null)))
		);
		expect(container.textContent).toBe('legacy-dark');
	});

	it('findDOMNode resolves host, fragment, and unmounted class ownership', async () => {
		class Host extends Component {
			render() {
				return createElement('button', null, 'host');
			}
		}
		class FragmentHost extends Component {
			render() {
				return createElement(Fragment, null, 'text', createElement('i', null, 'tail'));
			}
		}
		const hostRef = createRef<Host>();
		const fragmentRef = createRef<FragmentHost>();
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() =>
			root.render(
				createElement(
					'div',
					null,
					createElement(Host, { ref: hostRef }),
					createElement(FragmentHost, { ref: fragmentRef })
				)
			)
		);
		const host = hostRef.current!;
		const fragment = fragmentRef.current!;
		expect(findDOMNode(host)).toBe(container.querySelector('button'));
		expect(findDOMNode(fragment)?.nodeType).toBe(Node.TEXT_NODE);
		expect(exactComponentForReactInstance(host)).toBeDefined();
		expect(exactComponentForReactInstance(fragment)).toBeDefined();
		root.unmount();
		expect(findDOMNode(host)).toBeNull();
		expect(findDOMNode(fragment)).toBeNull();
		expect(exactComponentForReactInstance(host)).toBeUndefined();
		expect(exactComponentForReactInstance(fragment)).toBeUndefined();
	});

	it('releases class ownership and refs even when componentWillUnmount throws', async () => {
		class BrokenUnmount extends Component {
			componentWillUnmount() {
				throw new Error('unmount failure');
			}
			render() {
				return createElement('button', null, 'owned');
			}
		}
		const ref = createRef<BrokenUnmount>();
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(BrokenUnmount, { ref })));
		const instance = ref.current!;
		expect(exactComponentForReactInstance(instance)).toBeDefined();
		try {
			root.unmount();
		} catch {}
		expect(ref.current).toBeNull();
		expect(exactComponentForReactInstance(instance)).toBeUndefined();
		expect(findDOMNode(instance)).toBeNull();
	});
});
