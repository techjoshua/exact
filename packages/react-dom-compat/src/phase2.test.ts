/**
 * @vitest-environment jsdom
 */
import {
	act,
	createContext,
	createElement,
	createRef,
	forwardRef,
	memo,
	useContext,
	useEffect,
	useEffectEvent,
	useId,
	useImperativeHandle,
	useInsertionEffect,
	useLayoutEffect,
	useState,
	useSyncExternalStore
} from '@exact/react-compat';
import { describe, expect, it, vi } from 'vitest';
import { createRoot } from './client.js';
import { flushSync as flushReactDOM, unstable_batchedUpdates } from './index.js';

describe('React compatibility Phase 2', () => {
	it('augments React events and restores controlled input state', async () => {
		const observed: Array<[boolean, boolean, boolean, boolean]> = [];
		const onChange = vi.fn(
			(
				event: Event & {
					nativeEvent: Event;
					persist(): void;
					isDefaultPrevented(): boolean;
					isPropagationStopped(): boolean;
				}
			) => {
				event.preventDefault();
				event.stopPropagation();
				event.persist();
				observed.push([
					event.nativeEvent === event,
					event.isDefaultPrevented(),
					event.isPropagationStopped(),
					event.defaultPrevented
				]);
			}
		);
		const container = document.createElement('div');
		createRoot(container).render(createElement('input', { value: 'fixed', onChange }));
		const input = container.querySelector('input')!;
		input.value = 'browser edit';
		input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(observed).toEqual([[true, true, true, true]]);
		expect(input.value).toBe('fixed');
	});

	it('propagates reactive context through Provider and Consumer forms', async () => {
		const Theme = createContext('default');
		function HookReader() {
			return createElement('span', { id: 'hook' }, useContext(Theme));
		}
		function ConsumerReader() {
			return createElement(Theme.Consumer, null, (value: string) =>
				createElement('span', { id: 'consumer' }, value)
			);
		}
		const view = (value: string) =>
			createElement(
				Theme.Provider,
				{ value },
				createElement(HookReader, null),
				createElement(ConsumerReader, null)
			);
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(view('dark')));
		expect(container.querySelector('#hook')?.textContent).toBe('dark');
		expect(container.querySelector('#consumer')?.textContent).toBe('dark');
		await act(() => root.render(view('light')));
		expect(container.querySelector('#hook')?.textContent).toBe('light');
		expect(container.querySelector('#consumer')?.textContent).toBe('light');
	});

	it('orders insertion, layout, and passive setup/cleanup deterministically', async () => {
		const events: string[] = [];
		function Effects() {
			const [value, setValue] = useState(0);
			useInsertionEffect(() => {
				events.push(`insertion:${value}`);
				return () => events.push(`insertion-cleanup:${value}`);
			}, [value]);
			useLayoutEffect(() => {
				events.push(`layout:${value}`);
				return () => events.push(`layout-cleanup:${value}`);
			}, [value]);
			useEffect(() => {
				events.push(`passive:${value}`);
				return () => events.push(`passive-cleanup:${value}`);
			}, [value]);
			return createElement(
				'button',
				{ onClick: () => setValue((next) => next + 1) },
				String(value)
			);
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(Effects, null)));
		expect(events).toEqual(['insertion:0', 'layout:0', 'passive:0']);
		await act(() => container.querySelector('button')!.click());
		expect(events).toEqual([
			'insertion:0',
			'layout:0',
			'passive:0',
			'insertion-cleanup:0',
			'insertion:1',
			'layout-cleanup:0',
			'layout:1',
			'passive-cleanup:0',
			'passive:1'
		]);
		await act(() => root.unmount());
		expect(events.slice(-3)).toEqual([
			'insertion-cleanup:1',
			'layout-cleanup:1',
			'passive-cleanup:1'
		]);
	});

	it('runs every hook cleanup even when an earlier cleanup throws', async () => {
		const cleanups: string[] = [];
		function BrokenCleanup() {
			useEffect(
				() => () => {
					cleanups.push('first');
					throw new Error('cleanup failure');
				},
				[]
			);
			useEffect(
				() => () => {
					cleanups.push('second');
				},
				[]
			);
			return createElement('span', null, 'mounted');
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(BrokenCleanup, null)));
		try {
			root.unmount();
		} catch {}
		expect(cleanups).toEqual(['first', 'second']);
	});

	it('fulfills object, callback, forwarded, and imperative refs', async () => {
		const domRef = createRef<HTMLButtonElement>();
		const callbackValues: Array<Element | null> = [];
		const imperativeRef = createRef<{ focusLabel(): string }>();
		const Control = forwardRef<{ label: string }>((props, ref) => {
			useImperativeHandle(ref as never, () => ({ focusLabel: () => props.label }), [props.label]);
			return createElement('button', { ref: domRef }, props.label);
		});
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() =>
			root.render(
				createElement(
					'div',
					null,
					createElement(
						'span',
						{ ref: (value: Element | null) => callbackValues.push(value) },
						'callback'
					),
					createElement(Control, { label: 'Save', ref: imperativeRef } as never)
				)
			)
		);
		expect(domRef.current?.textContent).toBe('Save');
		expect(callbackValues.at(-1)).toBeInstanceOf(Element);
		expect(imperativeRef.current?.focusLabel()).toBe('Save');
		await act(() => root.unmount());
		expect(domRef.current).toBeNull();
		expect(callbackValues.at(-1)).toBeNull();
		expect(imperativeRef.current).toBeNull();
	});

	it('does not drop ref-only updates through forwardRef or memo', async () => {
		for (const memoized of [false, true]) {
			const renders = vi.fn();
			const ForwardedButton = forwardRef<Record<string, unknown>>((_props, ref) => {
				renders();
				return createElement('button', { ref }, 'button');
			});
			const Button = memoized ? memo(ForwardedButton) : ForwardedButton;
			const first = createRef<HTMLButtonElement>();
			const second = createRef<HTMLButtonElement>();
			const container = document.createElement('div');
			const root = createRoot(container);

			await act(() => root.render(createElement(Button, { ref: first } as never)));
			expect(first.current).toBe(container.querySelector('button'));
			await act(() => root.render(createElement(Button, { ref: second } as never)));
			expect(first.current).toBeNull();
			expect(second.current).toBe(container.querySelector('button'));
			expect(renders).toHaveBeenCalledTimes(2);
			await act(() => root.unmount());
			expect(second.current).toBeNull();
		}
	});

	it('subscribes to external stores and unsubscribes on unmount', async () => {
		let value = 0;
		const listeners = new Set<() => void>();
		const subscribe = vi.fn((listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		});
		const getSnapshot = () => value;
		function StoreView() {
			return createElement('span', null, String(useSyncExternalStore(subscribe, getSnapshot)));
		}
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(StoreView, null)));
		expect(container.textContent).toBe('0');
		value = 1;
		await act(() => {
			for (const listener of listeners) listener();
		});
		expect(container.textContent).toBe('1');
		root.unmount();
		expect(listeners.size).toBe(0);
		expect(subscribe).toHaveBeenCalledTimes(1);
	});

	it('supports memo comparators and stable unique IDs', async () => {
		const renders = vi.fn();
		function Label(props: { value: number }) {
			renders();
			const first = useId();
			const second = useId();
			return createElement('span', { id: first, 'data-second': second }, String(props.value));
		}
		const MemoLabel = memo(Label, (previous, next) => previous.value === next.value);
		const container = document.createElement('div');
		const root = createRoot(container);
		await act(() => root.render(createElement(MemoLabel, { value: 1 })));
		const firstId = container.querySelector('span')!.id;
		const secondId = container.querySelector('span')!.dataset.second;
		expect(firstId).not.toBe(secondId);
		await act(() => root.render(createElement(MemoLabel, { value: 1 })));
		expect(renders).toHaveBeenCalledTimes(1);
		expect(container.querySelector('span')!.id).toBe(firstId);
		await act(() => root.render(createElement(MemoLabel, { value: 2 })));
		expect(renders).toHaveBeenCalledTimes(2);
		expect(container.textContent).toBe('2');
	});

	it('keeps effect-event identity stable while reading the latest implementation', async () => {
		let invoke!: () => number;
		let update!: (value: number) => void;
		let first!: () => number;
		function EventView() {
			const [value, setValue] = useState(1);
			update = setValue;
			invoke = useEffectEvent(() => value);
			first ??= invoke;
			return createElement('span', null, String(value));
		}
		const container = document.createElement('div');
		createRoot(container).render(createElement(EventView, null));
		expect(invoke()).toBe(1);
		await act(() => update(2));
		expect(invoke).toBe(first);
		expect(invoke()).toBe(2);
	});

	it('flushes and batches ReactDOM compatibility updates', () => {
		let update!: (value: number | ((previous: number) => number)) => void;
		const renders = vi.fn();
		function Counter() {
			renders();
			const [value, setValue] = useState(0);
			update = setValue;
			return createElement('span', null, String(value));
		}
		const container = document.createElement('div');
		createRoot(container).render(createElement(Counter, null));
		flushReactDOM(() => update(1));
		expect(container.textContent).toBe('1');
		unstable_batchedUpdates(() => {
			update((value) => value + 1);
			update((value) => value + 1);
		});
		flushReactDOM();
		expect(container.textContent).toBe('3');
		expect(renders).toHaveBeenCalledTimes(3);
	});
});
