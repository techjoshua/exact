/** @vitest-environment jsdom */
import type { ExactRenderProgramBindingTarget } from '@exactjs/core/runtime/render-operations';
import type { ExactNarrowComponentUpdateContract } from '@exactjs/core/framework/component-contracts';
import type { AnyComponentInstance } from '@exactjs/core';
import * as reactive from '@exactjs/reactive/framework/runtime';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { expect, it, vi } from 'vitest';
import type { Mounted } from '../types.js';
import { bindCompiledComponentUpdate } from './component-update-binding.js';
import { bindCompiledWideComponentUpdate } from './component-update-wide-binding.js';
import {
	bindCompiledStateComponentUpdate,
	bindCompiledWideStateComponentUpdate
} from './component-state-update-binding.js';

type TestBinder = (
	target: ExactRenderProgramBindingTarget,
	index: number,
	updates: ExactNarrowComponentUpdateContract
) => void;

// Wide test inputs add the required extra mask word without weakening the narrow contract.
function wideTestBinder(bind: typeof bindCompiledWideComponentUpdate): TestBinder {
	return (target, index, updates) =>
		bind(target, index, {
			...updates,
			words: 3,
			bindings: updates.bindings.map((binding) => [...binding, 0] as const),
			apply: (targets, low, high) => updates.apply(targets, low, high)
		});
}
const lanes: readonly TestBinder[] = [
	bindCompiledComponentUpdate,
	wideTestBinder(bindCompiledWideComponentUpdate)
];

it.each(lanes)('prepares throwing forwarded values before acquisition (%#)', (bind) => {
	const failure = new Error('forwarded evaluation');
	const scope = reactive.createEffectScope();
	const parent = indexedReactiveObjects<{ label: string }>(['label']);
	parent.label = 'first';
	const props = indexedReactiveObjects(
		['label'],
		{},
		{
			label: reactive.computed(() => {
				throw failure;
			})
		},
		true
	);
	const state = indexedReactiveObjects<{ count: number }>(['count']);
	const owner = { props, state, scope } as unknown as AnyComponentInstance;
	const updates = {
		bindings: [
			[0, 1, 0],
			[0, 2, 0]
		] as const,
		props: 1,
		apply: vi.fn()
	};
	const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
	try {
		const keys = Object.getOwnPropertySymbols(owner);
		expect(() => bind(target, 0, updates)).toThrow(failure);
		expect(Object.getOwnPropertySymbols(owner)).toEqual(keys);
		expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
		reactive.writeIndexedReactiveValue(
			props,
			0,
			reactive.computed(() => parent.label)
		);
		bind(target, 0, updates);
		parent.label = 'next';
		reactive.flushSync();
		expect(updates.apply).toHaveBeenCalledOnce();
	} finally {
		scope.stop();
	}
});

it.each(lanes)('rolls back all acquired handles and preserves the primary failure (%#)', (bind) => {
	const primary = new Error('later acquisition'),
		cleanup = new Error('cleanup');
	const scope = reactive.createEffectScope();
	const source = indexedReactiveObjects<{ label: string }>(['label']);
	source.label = 'first';
	const props = indexedReactiveObjects(
		['label'],
		{},
		{ label: reactive.computed(() => source.label) },
		true
	);
	const state = indexedReactiveObjects<{ count: number }>(['count']);
	const owner = { props, state, scope } as unknown as AnyComponentInstance;
	const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
	const updates = {
		bindings: [
			[0, 1, 0],
			[0, 2, 0]
		] as const,
		props: 1,
		apply: vi.fn()
	};
	const original = reactive.subscribeKeys;
	let calls = 0;
	const released: number[] = [];
	const spy = vi.spyOn(reactive, 'subscribeKeys').mockImplementation((...args) => {
		const call = ++calls;
		if (call === 3) throw primary;
		const stop = original(...args);
		return () => {
			stop();
			released.push(call);
			if (call === 1) throw cleanup;
		};
	});
	try {
		const symbols = Object.getOwnPropertySymbols(owner);
		expect(() => bind(target, 0, updates)).toThrow(primary);
		expect(released).toEqual([1, 2]);
		expect(primary).toHaveProperty('suppressed', [cleanup]);
		expect(Object.getOwnPropertySymbols(owner)).toEqual(symbols);
		expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
		expect(target.stopBindings).toEqual([]);
		spy.mockRestore();
		bind(target, 0, updates);
		state.count = 1;
		reactive.flushSync();
		expect(updates.apply).toHaveBeenCalledOnce();
	} finally {
		spy.mockRestore();
		scope.stop();
	}
});

it.each(lanes)('catches up a preparation mutation after initialized target commit (%#)', (bind) => {
	const scope = reactive.createEffectScope();
	const state = indexedReactiveObjects<{ count: number }>(['count']);
	state.count = 0;
	const props = indexedReactiveObjects(
		['label'],
		{},
		{
			label: reactive.computed(() => {
				state.count = 9;
				reactive.flushSync();
				return 'ready';
			})
		},
		true
	);
	const owner = { props, state, scope } as unknown as AnyComponentInstance;
	const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
	const updates = {
		bindings: [
			[0, 1, 0],
			[0, 2, 0]
		] as const,
		props: 1,
		apply: vi.fn()
	};
	try {
		bind(target, 0, updates);
		expect(updates.apply).toHaveBeenCalledOnce();
		expect(updates.apply.mock.calls[0]?.[0]).toEqual([target]);
		state.count = 10;
		reactive.flushSync();
		expect(updates.apply).toHaveBeenCalledTimes(2);
	} finally {
		scope.stop();
	}
});

it('keeps the old forwarded subscription when replacement evaluation throws', () => {
	const failures: unknown[] = [];
	const scope = reactive.createEffectScope(undefined, (e) => failures.push(e));
	const source = indexedReactiveObjects<{ label: string }>(['label']);
	source.label = 'first';
	const props = indexedReactiveObjects(
		['label'],
		{},
		{ label: reactive.computed(() => source.label) },
		true
	);
	const owner = { props, state: {}, scope } as unknown as AnyComponentInstance;
	const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
	const updates = { bindings: [[0, 1, 0]] as const, props: 1, apply: vi.fn() };
	const failure = new Error('replacement evaluation');
	try {
		bindCompiledComponentUpdate(target, 0, updates);
		reactive.writeIndexedReactiveValue(
			props,
			0,
			reactive.computed(() => {
				throw failure;
			})
		);
		reactive.flushSync();
		expect(failures).toEqual([failure]);
		source.label = 'old source still owned';
		reactive.flushSync();
		expect(updates.apply).toHaveBeenCalledOnce();
		reactive.writeIndexedReactiveValue(
			props,
			0,
			reactive.computed(() => source.label)
		);
		reactive.flushSync();
		updates.apply.mockClear();
		source.label = 'progress';
		reactive.flushSync();
		expect(updates.apply).toHaveBeenCalledOnce();
		reactive.writeIndexedReactiveValue(props, 0, 'ordinary input');
		reactive.flushSync();
		updates.apply.mockClear();
		source.label = 'retired after ordinary replacement';
		reactive.flushSync();
		expect(updates.apply).not.toHaveBeenCalled();
		expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(1);
	} finally {
		scope.stop();
	}
});

it.each([
	bindCompiledStateComponentUpdate,
	wideTestBinder(bindCompiledWideStateComponentUpdate)
] as const)('does not commit state-only storage before a successful subscription (%#)', (bind) => {
	const scope = reactive.createEffectScope();
	const state = indexedReactiveObjects<{ count: number }>(['count']);
	const owner = { state, scope } as unknown as AnyComponentInstance;
	const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
	const updates = { bindings: [[0, 1, 0]] as const, apply: vi.fn() };
	const failure = new Error('subscription failure');
	const spy = vi.spyOn(reactive, 'subscribeKeys').mockImplementationOnce(() => {
		throw failure;
	});
	try {
		const symbols = Object.getOwnPropertySymbols(owner);
		expect(() => bind(target, 0, updates)).toThrow(failure);
		expect(Object.getOwnPropertySymbols(owner)).toEqual(symbols);
		spy.mockRestore();
		bind(target, 0, updates);
		state.count = 1;
		reactive.flushSync();
		expect(updates.apply).toHaveBeenCalledOnce();
	} finally {
		spy.mockRestore();
		scope.stop();
	}
});

// This unit isolates binder acquisition from DOM claims. The shared authored journey separately
// executes real component slot installation, retained updates and mounted teardown.
it('initializes direct program callback state before catch-up and owns its teardown', async () => {
	const program = await import('./render-program-components.js');
	const { bindCompiledProgramComponent } = await import('./render-program-bindings.js');
	const install = vi.spyOn(program, 'bindProgramComponent').mockReturnValue(true);
	const apply = vi.spyOn(program, 'applyProgramComponent').mockReturnValue(true);
	const scope = reactive.createEffectScope();
	const state = indexedReactiveObjects<{ count: number }>(['count']);
	state.count = 0;
	const props = indexedReactiveObjects(
		['label'],
		{},
		{
			label: reactive.computed(() => {
				state.count = 9;
				reactive.flushSync();
				return 'ready';
			})
		},
		true
	);
	const owner = { state, props, scope } as unknown as AnyComponentInstance;
	const target = {
		mounted: { scope, renderProgram: { parentInstance: owner } } as unknown as Mounted,
		stopBindings: [] as Array<{ stop(): void }>,
		initialBinding: false,
		valid: true
	};
	try {
		bindCompiledProgramComponent(target, 0, [[0], [0]], 1);
		reactive.flushSync();
		expect(apply).toHaveBeenCalledOnce();
		for (const binding of target.stopBindings) binding.stop();
		state.count = 10;
		reactive.flushSync();
		expect(apply).toHaveBeenCalledOnce();
		expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
	} finally {
		install.mockRestore();
		apply.mockRestore();
		scope.stop();
	}
});

it.each(lanes)(
	'refuses incomplete dependencies without partial subscription and then progresses (%#)',
	(bind) => {
		const errors: unknown[] = [];
		const scope = reactive.createEffectScope(undefined, (error) => errors.push(error));
		const props = indexedReactiveObjects<{ label: string }>(['label']);
		const state = indexedReactiveObjects<{ count: number }>(['count']);
		props.label = 'initial';
		state.count = 0;
		const owner = { props, state, scope } as unknown as AnyComponentInstance;
		const apply = vi.fn();
		const updates = {
			bindings: [
				[0, 1, 0],
				[1, 2, 0]
			] as const,
			props: 1,
			apply
		};
		const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
		try {
			const symbols = Object.getOwnPropertySymbols(owner);
			bind(target, 0, updates);
			expect(target.valid).toBe(false);
			expect(target.stopBindings).toEqual([]);
			expect(Object.getOwnPropertySymbols(owner)).toEqual(symbols);
			props.label = 'after refused binding';
			reactive.flushSync();
			expect(errors).toEqual([]);
			expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
			expect(apply).not.toHaveBeenCalled();
			const valid = {
				...updates,
				bindings: [
					[0, 1, 0],
					[0, 2, 0]
				] as const
			};
			const next = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
			bind(next, 0, valid);
			state.count = 1;
			reactive.flushSync();
			expect(apply).toHaveBeenCalledOnce();
			expect(errors).toEqual([]);
		} finally {
			scope.stop();
		}
	}
);

for (const replacement of ['nested', 'queued', 'aba', 'dispose', 'scope'] as const)
	it.each(lanes)(
		`retains the current forwarded owner across ${replacement} preparation (%#)`,
		async (bind) => {
			const { CompiledComponentDependencies } = await import('./component-update-dependencies.js');
			const errors: unknown[] = [];
			const scope = reactive.createEffectScope(undefined, (error) => errors.push(error));
			const old = indexedReactiveObjects<{ label: string }>(['label']);
			const middle = indexedReactiveObjects<{ label: string }>(['label']);
			const final = indexedReactiveObjects<{ label: string }>(['label']);
			old.label = 'old';
			middle.label = 'middle';
			final.label = 'final';
			const oldValue = reactive.computed(() => old.label);
			const finalValue = reactive.computed(() => final.label);
			const props = indexedReactiveObjects(
				['label'],
				{},
				{ label: replacement === 'dispose' ? 'old' : oldValue },
				true
			);
			const owner = { props, state: {}, scope } as unknown as AnyComponentInstance;
			const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
			const apply = vi.fn();
			try {
				bind(target, 0, { props: 1, bindings: [[0, 1, 0]], apply });
				const dependencies = Object.getOwnPropertySymbols(owner)
					.map((key) => Reflect.get(owner, key) as { d?: unknown })
					.find((state) => state.d instanceof CompiledComponentDependencies)?.d;
				expect(dependencies).toBeInstanceOf(CompiledComponentDependencies);
				if (!(dependencies instanceof CompiledComponentDependencies))
					throw new Error('Missing dependencies');
				reactive.writeIndexedReactiveValue(
					props,
					0,
					reactive.computed(() => {
						if (replacement === 'dispose') dependencies.stop();
						else if (replacement === 'scope') scope.stop();
						else {
							reactive.writeIndexedReactiveValue(props, 0, finalValue);
							if (replacement !== 'queued') reactive.flushSync();
							if (replacement === 'aba') {
								reactive.writeIndexedReactiveValue(props, 0, oldValue);
								reactive.flushSync();
							}
						}
						return middle.label;
					})
				);
				reactive.flushSync();
				apply.mockClear();
				(replacement === 'aba' ? old : final).label = 'current source';
				reactive.flushSync();
				expect(apply.mock.calls).toHaveLength(
					replacement === 'dispose' || replacement === 'scope' ? 0 : 1
				);
				apply.mockClear();
				middle.label = 'superseded source';
				reactive.flushSync();
				expect(apply).not.toHaveBeenCalled();
				expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(
					replacement === 'dispose' || replacement === 'scope' ? 0 : 2
				);
				dependencies.stop();
				expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
				old.label = middle.label = final.label = 'after stop';
				reactive.flushSync();
				expect(apply).not.toHaveBeenCalled();
				expect(errors).toEqual([]);
			} finally {
				scope.stop();
			}
		}
	);

it('keeps the final forwarded subscription in the direct program lane during nested preparation', async () => {
	const program = await import('./render-program-components.js');
	const { bindCompiledProgramComponent } = await import('./render-program-bindings.js');
	const install = vi.spyOn(program, 'bindProgramComponent').mockReturnValue(true);
	const apply = vi.spyOn(program, 'applyProgramComponent').mockReturnValue(true);
	const errors: unknown[] = [];
	const scope = reactive.createEffectScope(undefined, (error) => errors.push(error));
	const old = indexedReactiveObjects<{ label: string }>(['label']);
	const middle = indexedReactiveObjects<{ label: string }>(['label']);
	const final = indexedReactiveObjects<{ label: string }>(['label']);
	const props = indexedReactiveObjects(
		['label'],
		{},
		{ label: reactive.computed(() => old.label) },
		true
	);
	const finalValue = reactive.computed(() => final.label);
	const owner = { props, state: {}, scope } as unknown as AnyComponentInstance;
	const target = {
		mounted: { scope, renderProgram: { parentInstance: owner } } as unknown as Mounted,
		stopBindings: [] as Array<{ stop(): void }>,
		initialBinding: false,
		valid: true
	};
	try {
		bindCompiledProgramComponent(target, 0, [[0]], 1);
		reactive.writeIndexedReactiveValue(
			props,
			0,
			reactive.computed(() => {
				reactive.writeIndexedReactiveValue(props, 0, finalValue);
				reactive.flushSync();
				return middle.label;
			})
		);
		reactive.flushSync();
		apply.mockClear();
		final.label = 'current';
		reactive.flushSync();
		expect(apply).toHaveBeenCalledOnce();
		apply.mockClear();
		middle.label = 'retired';
		reactive.flushSync();
		expect(apply).not.toHaveBeenCalled();
		expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(2);
		for (const binding of target.stopBindings) binding.stop();
		expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
		final.label = 'after stop';
		reactive.flushSync();
		expect(apply).not.toHaveBeenCalled();
		expect(errors).toEqual([]);
	} finally {
		install.mockRestore();
		apply.mockRestore();
		scope.stop();
	}
});

it.each(['reenter', 'throw'] as const)(
	'keeps the installed replacement when old release can %s',
	async (mode) => {
		const { CompiledComponentDependencies } = await import('./component-update-dependencies.js');
		const errors: unknown[] = [];
		const scope = reactive.createEffectScope(undefined, (error) => errors.push(error));
		const old = indexedReactiveObjects<{ label: string }>(['label']);
		const next = indexedReactiveObjects<{ label: string }>(['label']);
		const final = indexedReactiveObjects<{ label: string }>(['label']);
		const props = indexedReactiveObjects(
			['label'],
			{},
			{ label: reactive.computed(() => old.label) },
			true
		);
		const owner = { props, state: {}, scope } as unknown as AnyComponentInstance;
		const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
		const apply = vi.fn();
		const failure = new Error('old release');
		const finalValue = reactive.computed(() => final.label);
		try {
			bindCompiledComponentUpdate(target, 0, { props: 1, bindings: [[0, 1, 0]], apply });
			const dependencies = Object.getOwnPropertySymbols(owner)
				.map((key) => Reflect.get(owner, key) as { d?: unknown })
				.find((state) => state.d instanceof CompiledComponentDependencies)?.d;
			if (!(dependencies instanceof CompiledComponentDependencies))
				throw new Error('Missing dependencies');
			const previous = dependencies.f[0]!;
			const release = previous.stop!;
			previous.stop = vi.fn(() => {
				release();
				if (mode === 'throw') throw failure;
				reactive.writeIndexedReactiveValue(props, 0, finalValue);
				reactive.flushSync();
			});
			reactive.writeIndexedReactiveValue(
				props,
				0,
				reactive.computed(() => next.label)
			);
			reactive.flushSync();
			expect(previous.stop).toHaveBeenCalledOnce();
			apply.mockClear();
			(mode === 'throw' ? next : final).label = 'current';
			reactive.flushSync();
			expect(apply).toHaveBeenCalledOnce();
			apply.mockClear();
			old.label = 'retired';
			if (mode === 'reenter') next.label = 'also retired';
			reactive.flushSync();
			expect(apply).not.toHaveBeenCalled();
			dependencies.stop();
			expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
			expect(errors).toEqual(mode === 'throw' ? [failure] : []);
		} finally {
			scope.stop();
		}
	}
);

it.each(['supersede', 'fail'] as const)(
	'accounts for provisional replacement acquisition that can %s',
	async (mode) => {
		const { CompiledComponentDependencies } = await import('./component-update-dependencies.js');
		const errors: unknown[] = [];
		const scope = reactive.createEffectScope(undefined, (error) => errors.push(error));
		const old = indexedReactiveObjects<{ label: string }>(['label']);
		const next = indexedReactiveObjects<{ label: string }>(['label']);
		const final = indexedReactiveObjects<{ label: string }>(['label']);
		const nextValue = reactive.computed(() => next.label);
		const finalValue = reactive.computed(() => final.label);
		const nextReference = reactive.ref(nextValue);
		const props = indexedReactiveObjects(
			['label'],
			{},
			{ label: reactive.computed(() => old.label) },
			true
		);
		const owner = { props, state: {}, scope } as unknown as AnyComponentInstance;
		const target = { mounted: {} as Mounted, owner, stopBindings: [], valid: true };
		const apply = vi.fn();
		const failure = new Error('replacement acquisition');
		const subscribe = reactive.subscribeKeys;
		let subscription: ReturnType<typeof vi.spyOn> | undefined;
		try {
			bindCompiledComponentUpdate(target, 0, { props: 1, bindings: [[0, 1, 0]], apply });
			const dependencies = Object.getOwnPropertySymbols(owner)
				.map((key) => Reflect.get(owner, key) as { d?: unknown })
				.find((state) => state.d instanceof CompiledComponentDependencies)?.d;
			if (!(dependencies instanceof CompiledComponentDependencies))
				throw new Error('Missing dependencies');
			subscription = vi
				.spyOn(reactive, 'subscribeKeys')
				.mockImplementation((source, keys, callback, options) => {
					if (source !== nextReference.target) return subscribe(source, keys, callback, options);
					if (mode === 'fail') throw failure;
					const release = subscribe(source, keys, callback, options);
					reactive.writeIndexedReactiveValue(props, 0, finalValue);
					reactive.flushSync();
					return release;
				});
			reactive.writeIndexedReactiveValue(props, 0, nextValue);
			reactive.flushSync();
			subscription.mockRestore();
			apply.mockClear();
			(mode === 'fail' ? old : final).label = 'still owned';
			reactive.flushSync();
			expect(apply).toHaveBeenCalledOnce();
			apply.mockClear();
			next.label = 'not owned';
			reactive.flushSync();
			expect(apply).not.toHaveBeenCalled();
			if (mode === 'fail') {
				reactive.writeIndexedReactiveValue(props, 0, finalValue);
				reactive.flushSync();
				apply.mockClear();
				final.label = 'following progress';
				reactive.flushSync();
				expect(apply).toHaveBeenCalledOnce();
			}
			dependencies.stop();
			expect((scope as unknown as { reactions: Set<unknown> }).reactions.size).toBe(0);
			expect(errors).toEqual(mode === 'fail' ? [failure] : []);
		} finally {
			subscription?.mockRestore();
			scope.stop();
		}
	}
);
