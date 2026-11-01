/** @vitest-environment jsdom */
import './framework/enhancements.js';
import { afterEach, expect, it, vi } from 'vitest';
import { createExpression } from '@exactjs/core/runtime/render';
import { reactive, flushSync } from '@exactjs/reactive';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { setElementProp, clearElementProps } from './props.js';
import { createRendererRoot } from './renderer/root-construction.js';
import { withDomWork } from './renderer/limits.js';
import { mountDetachedChildren } from './renderer/mounting/children.js';
import { SuppliedPlacementPlan } from './renderer/patching/supplied-placement-plan.js';
import { createCompiledOperation } from './test-support/native-operations.js';
import { flushControlledSelects } from './controlled-select.js';
import type { Mounted } from './types.js';

const releases: Array<() => void> = [];
afterEach(() => {
	for (const release of releases.splice(0).reverse()) release();
	vi.restoreAllMocks();
});

/** Uses real renderer placement and scopes while isolating one physical select transaction. */
function control(multiple = false) {
	const select = document.createElement('select');
	select.multiple = multiple;
	const container = document.createElement('main');
	container.append(select);
	const root = createRendererRoot(container, null, {}, { version: 3 });
	const scope = createEffectScope();
	releases.push(() => {
		clearElementProps(select);
		scope.stop();
	});
	const option = (value: string) => {
		const mounted = mountDetachedChildren(
			root,
			[createCompiledOperation('option', { value }, value)],
			undefined,
			scope,
			select
		)[0]!;
		root.suppliedPlacementPlan!.own(mounted);
		root.suppliedPlacementPlan!.place(select, mounted, null);
		return mounted;
	};
	const transaction = (run: () => void) =>
		withDomWork(root, () => {
			root.suppliedPlacementPlan = new SuppliedPlacementPlan(root);
			run();
		});
	return { select, root, scope, option, transaction };
}

it('applies the accepted value once after all supplied options commit without reevaluating it', () => {
	const { select, root, scope, option, transaction } = control();
	const coerce = vi.fn(() => 'dark');
	const setter = vi.spyOn(HTMLSelectElement.prototype, 'value', 'set');
	transaction(() => {
		setElementProp(root, select, 'value', { toString: coerce }, undefined, scope);
		option('system');
		option('light');
		option('dark');
		expect(select.options).toHaveLength(0);
	});
	expect(select.value).toBe('dark');
	expect(coerce).toHaveBeenCalledTimes(1);
	expect(setter.mock.calls).toEqual([['dark']]);
	expect(root.controlledSelectUpdates).toBeUndefined();
});

it.each([false, true])(
	'reconciles retained replacement and removal without another source read (multiple=%s)',
	(multiple) => {
		const { select, root, scope, option, transaction } = control(multiple);
		let selected!: Mounted;
		transaction(() => {
			setElementProp(
				root,
				select,
				'value',
				multiple ? ['dark', 'light'] : 'dark',
				undefined,
				scope
			);
			option('system');
			option('light');
			selected = option('dark');
		});
		const original = select;
		let replacement!: Mounted;
		transaction(() => {
			root.suppliedPlacementPlan!.remove(select, selected, 'reconcile-replaced');
			replacement = option('dark');
		});
		expect(select).toBe(original);
		expect(select.contains(selected.dom)).toBe(false);
		expect(select.contains(replacement.dom)).toBe(true);
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(
			multiple ? ['light', 'dark'] : ['dark']
		);
		transaction(() => root.suppliedPlacementPlan!.remove(select, replacement, 'reconcile-removed'));
		expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(
			multiple ? ['light'] : []
		);
	}
);

it('reconciles a changed option value outside a child transaction, then supports the next value interaction', () => {
	const { select, root, scope, option, transaction } = control();
	let target!: Mounted;
	transaction(() => {
		setElementProp(root, select, 'value', 'dark', undefined, scope);
		option('system');
		target = option('light');
	});
	expect(select.selectedIndex).toBe(-1);
	setElementProp(root, target.dom as Element, 'value', 'dark', 'light', scope);
	expect(select.value).toBe('dark');
	setElementProp(root, select, 'value', 'system', 'dark', scope);
	expect(select.selectedIndex).toBe(0);
});

it('discards failed preparation and preserves the original exception identity', () => {
	const { select, root, scope, option, transaction } = control();
	const failure = new Error('prepare failed');
	expect(() =>
		transaction(() => {
			setElementProp(root, select, 'value', 'dark', undefined, scope);
			option('dark');
			throw failure;
		})
	).toThrow(failure);
	expect(select.options).toHaveLength(0);
	expect(root.controlledSelectUpdates).toBeUndefined();
	select.add(new Option('System', 'system'));
	flushControlledSelects(root);
	expect(select.value).toBe('system');
});

it.each(['superseded', 'disposed', 'released'] as const)(
	'never publishes a stale select update after %s',
	(mode) => {
		const { select, root, scope, option, transaction } = control();
		const setter = vi.spyOn(HTMLSelectElement.prototype, 'value', 'set');
		transaction(() => {
			setElementProp(root, select, 'value', 'dark', undefined, scope);
			option('system');
			option('dark');
			if (mode === 'superseded')
				root.componentInputAttempt = { operation: null, deliveryStarted: false };
			else if (mode === 'disposed') scope.stop();
			else clearElementProps(select);
		});
		expect(setter).not.toHaveBeenCalled();
		expect(root.controlledSelectUpdates).toBeUndefined();
	}
);

it('retains array values independently of multiple prop application order', () => {
	const { select, root, scope, option, transaction } = control();
	transaction(() => {
		setElementProp(root, select, 'value', ['light', 'dark'], undefined, scope);
		setElementProp(root, select, 'multiple', true, undefined, scope);
		option('system');
		option('light');
		option('dark');
	});
	expect(Array.from(select.selectedOptions, (option) => option.value)).toEqual(['light', 'dark']);
	setElementProp(root, select, 'multiple', false, true, scope);
	expect(select.selectedIndex).toBe(-1);
});

it.each(['commit', 'abort'] as const)(
	'keeps a parent frame selection owned while a nested frame settles by %s',
	(completion) => {
		const { select, root, scope, option, transaction } = control();
		transaction(() => {
			const parent = root.suppliedPlacementPlan!;
			setElementProp(root, select, 'value', 'dark', undefined, scope);
			option('system');
			option('dark');
			const nested = new SuppliedPlacementPlan(root, parent);
			root.suppliedPlacementPlan = nested;
			if (completion === 'commit') nested.commit();
			else nested.abort();
			expect(root.controlledSelectUpdates?.get(select)?.frame).toBe(parent);
			expect(select.options).toHaveLength(0);
			root.suppliedPlacementPlan = parent;
		});
		expect(select.value).toBe('dark');
		expect(root.controlledSelectUpdates).toBeUndefined();
	}
);

it('reconciles ordinary reactive text only for an option without an explicit value', () => {
	const { select, root, scope, transaction } = control();
	const state = reactive({ label: 'dark' });
	let option!: Mounted;
	transaction(() => {
		setElementProp(root, select, 'value', 'dark', undefined, scope);
		option = mountDetachedChildren(
			root,
			[
				createCompiledOperation(
					'option',
					{},
					createExpression(() => state.label)
				)
			],
			undefined,
			scope,
			select
		)[0]!;
		root.suppliedPlacementPlan!.own(option);
		root.suppliedPlacementPlan!.place(select, option, null);
	});
	expect(select.value).toBe('dark');
	state.label = 'light';
	flushSync();
	expect(select.selectedIndex).toBe(-1);
	state.label = 'dark';
	flushSync();
	expect(select.value).toBe('dark');
	expect(select.options[0]).toBe(option.dom);
	setElementProp(root, option.dom as Element, 'value', 'dark', undefined, scope);
	const setter = vi.spyOn(HTMLSelectElement.prototype, 'value', 'set');
	state.label = 'renamed';
	flushSync();
	expect(select.value).toBe('dark');
	expect(setter).not.toHaveBeenCalled();
	scope.stop();
	state.label = 'disposed';
	flushSync();
	expect(option.dom.textContent).toBe('renamed');
});

it.each(['', 'dark'])('matches native initial listbox selection for value %j', (value) => {
	const { select, root, scope } = control();
	select.size = 2;
	select.add(new Option(value, value));
	const native = select.cloneNode(true) as HTMLSelectElement;
	native.value = value;
	expect(select.selectedIndex).toBe(-1);
	setElementProp(root, select, 'value', value, undefined, scope);
	expect(select.selectedIndex).toBe(native.selectedIndex);
	expect(select.selectedIndex).toBe(0);
});

it.each(['', 'dark'])('selects a retained explicit option that acquires value %j', (value) => {
	const { select, root, scope } = control();
	const option = new Option('other');
	select.add(option);
	setElementProp(root, select, 'value', value, undefined, scope);
	expect(select.selectedIndex).toBe(-1);
	setElementProp(root, option, 'value', value, undefined, scope);
	expect(option.hasAttribute('value')).toBe(true);
	expect(select.selectedIndex).toBe(0);
	const setter = vi.spyOn(HTMLSelectElement.prototype, 'value', 'set');
	setElementProp(root, option, 'value', value, value, scope);
	expect(setter).not.toHaveBeenCalled();
});

it.each(['', 'dark'])(
	'selects retained implicit text that becomes %j without another value read',
	(value) => {
		const { select, root, scope, transaction } = control();
		const state = reactive({ label: 'other' });
		const read = vi.fn(() => value);
		let option!: Mounted;
		transaction(() => {
			setElementProp(root, select, 'value', read(), undefined, scope);
			option = mountDetachedChildren(
				root,
				[
					createCompiledOperation(
						'option',
						{},
						createExpression(() => state.label)
					)
				],
				undefined,
				scope,
				select
			)[0]!;
			root.suppliedPlacementPlan!.own(option);
			root.suppliedPlacementPlan!.place(select, option, null);
		});
		expect(select.selectedIndex).toBe(-1);
		state.label = value;
		flushSync();
		expect(select.selectedIndex).toBe(0);
		expect(select.options[0]).toBe(option.dom);
		expect(read).toHaveBeenCalledTimes(1);
	}
);

it.each(['', 'dark'])('retains native first-match identity for duplicate value %j', (value) => {
	const { select, root, scope } = control();
	select.add(new Option('first', value));
	select.add(new Option('second', value));
	select.selectedIndex = 1;
	const native = select.cloneNode(true) as HTMLSelectElement;
	native.selectedIndex = 1;
	native.value = value;
	setElementProp(root, select, 'value', value, undefined, scope);
	expect(select.selectedIndex).toBe(native.selectedIndex);
	expect(select.selectedIndex).toBe(0);
});
