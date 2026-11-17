import { testComponent } from '@exactjs/testing';
import { afterEach, expect, it, vi } from 'vitest';
import {
	ClipboardProbe,
	ClipboardNoCatchProbe,
	ClipboardPromiseProbe,
	CleanupProbe,
	InheritedAwaitProbe,
	NestedAssimilationProbe,
	AsyncPrimitiveAwaitProbe
} from './test-support/cancelled-task-catch.fixtures.js';
afterEach(() => vi.unstubAllGlobals());

for (const component of [ClipboardProbe, ClipboardNoCatchProbe, ClipboardPromiseProbe])
	for (const rejectFirst of [false, true])
		it(`${component.name}: keeps latest optimistic state (older task rejects: ${rejectFirst})`, async () => {
			const first = pendingOperation();
			const second = pendingOperation();
			const writeText = vi
				.fn()
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise);
			vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }));
			const view = await testComponent(component).mount();
			try {
				await view.getByRole('button', { name: 'First' }).click({ settleTasks: false });
				expect(view.root.state().copied).toBe('first');
				await view.getByRole('button', { name: 'Second' }).click({ settleTasks: false });
				second.resolve();
				if (rejectFirst) first.reject(new Error('First failed'));
				else first.resolve();
				await view.settle();
				expect(view.root.state().copied).toBe('second');
				expect(view.getBySelector('output').text()).toBe('second');
			} finally {
				first.resolve();
				second.resolve();
				view.unmount();
			}
		});

for (const mode of ['increment', 'expression', 'alias', 'return', 'array', 'map']) {
	it(`fences ${mode} writes in finally and admits subsequent work`, async () => {
		const first = pendingOperation();
		const writeText = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
		vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }));
		const view = await testComponent(CleanupProbe).props({ mode }).mount();
		try {
			await view.getByRole('button', { name: 'First' }).click({ settleTasks: false });
			await view.getByRole('button', { name: 'Second' }).click();
			first.resolve();
			await view.settle();
			const expected = mode === 'array' ? '0:1:0' : mode === 'map' ? '0:0:1' : '1:0:0';
			expect(view.getBySelector('output').text()).toBe(expected);
			await view.getByRole('button', { name: 'First' }).click();
			expect(view.getBySelector('output').text()).toBe(
				mode === 'array' ? '0:2:0' : mode === 'map' ? '0:0:2' : '2:0:0'
			);
		} finally {
			first.resolve();
			view.unmount();
		}
	});
}

it('allows catch recovery for a current failure and a later successful task', async () => {
	const writeText = vi
		.fn()
		.mockRejectedValueOnce(new Error('Clipboard unavailable'))
		.mockResolvedValue(undefined);
	vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }));
	const view = await testComponent(ClipboardProbe).mount();
	try {
		await view.getByRole('button', { name: 'First' }).click();
		expect(view.root.state().copied).toBe('');
		await view.getByRole('button', { name: 'Second' }).click();
		expect(view.root.state().copied).toBe('second');
	} finally {
		view.unmount();
	}
});

for (const mode of ['increment', 'expression', 'alias', 'return', 'array', 'map']) {
	it(`fences ${mode} finalization after disposal`, async () => {
		const pending = pendingOperation();
		vi.stubGlobal(
			'navigator',
			Object.create(navigator, { clipboard: { value: { writeText: () => pending.promise } } })
		);
		const view = await testComponent(CleanupProbe).props({ mode }).mount();
		const state = view.root.state();
		try {
			await view.getByRole('button', { name: 'First' }).click({ settleTasks: false });
			view.unmount();
			pending.resolve();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(state.count).toBe(0);
			expect(state.items).toHaveLength(0);
			expect(state.rows.size).toBe(0);
		} finally {
			pending.resolve();
			view.unmount();
		}
	});
}

function pendingOperation() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

it('retains inherited Await getter receiver and abrupt completion through a real task', async () => {
	const view = await testComponent(InheritedAwaitProbe).mount();
	const button = view.container.querySelector('button');
	try {
		expect(view.getBySelector('output').text()).toBe('initial');
		await view.getByRole('button', { name: 'Run inherited' }).click();
		expect(view.getBySelector('output').text()).toBe('receiver');
		expect(view.root.state().label).toBe('receiver');
		expect(view.container.querySelector('button')).toBe(button);
		await view.getByRole('button', { name: 'Throw inherited' }).click();
		expect(view.getBySelector('output').text()).toBe('caught:inherited');
	} finally {
		view.unmount();
	}
	expect(view.container.textContent).toBe('');
});

it('distinguishes nested resolve assimilation from rejection and throwing argument Get', async () => {
	const view = await testComponent(NestedAssimilationProbe).mount();
	const button = view.container.querySelector('button');
	try {
		await view.getByRole('button', { name: 'Resolve nested' }).click();
		expect(view.getBySelector('output').text()).toBe('resolved');
		expect(view.root.state().trace.startsWith('argument|')).toBe(true);
		expect(view.root.state().trace).toContain('then|');
		await view.getByRole('button', { name: 'Reject nested' }).click();
		expect(view.getBySelector('output').text()).toBe('rejected');
		expect(view.root.state().trace).toBe('argument|');
		await view.getByRole('button', { name: 'Throw resolve argument' }).click();
		expect(view.getBySelector('output').text()).toBe('caught:argument');
		expect(view.root.state().trace).toBe('argument|');
		await view.getByRole('button', { name: 'Throw reject argument' }).click();
		expect(view.getBySelector('output').text()).toBe('caught:argument');
		expect(view.root.state().trace).toBe('argument|');
		expect(view.container.querySelector('button')).toBe(button);
	} finally {
		view.unmount();
	}
	expect(view.container.textContent).toBe('');
});

it('retains constructor Get while awaiting an async primitive and restores its descriptor', async () => {
	const original = Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor');
	const view = await testComponent(AsyncPrimitiveAwaitProbe).mount();
	const button = view.container.querySelector('button');
	try {
		await view.getByRole('button', { name: 'Await primitive' }).click();
		expect(view.getBySelector('output').text()).toBe('primitive');
		expect(view.root.state().constructorRead).toBe(true);
		expect(view.getBySelector('data').text()).toBe('true');
		expect(view.container.querySelector('button')).toBe(button);
		expect(Object.getOwnPropertyDescriptor(Promise.prototype, 'constructor')).toEqual(original);
	} finally {
		view.unmount();
		if (original) Object.defineProperty(Promise.prototype, 'constructor', original);
		else Reflect.deleteProperty(Promise.prototype, 'constructor');
	}
	expect(view.container.textContent).toBe('');
});
