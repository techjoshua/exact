import { ChildInputOwner as ServerChildInputOwner } from '../../component-composition-corpus/test-support/component-child-input.fixtures.js?exact-target=server';
import { createPreparedServerComponentInputReference as serverReceipt } from '@exactjs/core/framework/server-render-structure';
import { renderToString } from '@exactjs/ssr';
/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { ChildInputOwner } from '../../component-composition-corpus/test-support/component-child-input.fixtures.js';
import { createCompiledComponentInputReceipt as receipt } from '@exactjs/core/runtime/component-operations';
import { render, unmount } from './root.js';
import { adoptCompiledComponentInputRoot } from './framework/component-root.js';
import { findElementOwner } from './testing.js';
import { reactive, flushSync } from '@exactjs/reactive';
import { currentEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';

it('acquires one live receiving snapshot and releases its reader after disposal', () => {
	const host = document.createElement('div'),
		scopes: Array<EffectScope | undefined> = [];
	const state = reactive({ value: 'first' });
	let reads = 0;
	const probe = {
		get value() {
			reads++;
			scopes.push(currentEffectScope());
			return state.value;
		}
	};
	try {
		render(receipt(ChildInputOwner, { probe }), host);
		const leaf = host.querySelector('i'),
			owner = leaf && findElementOwner(leaf);
		expect(reads).toBe(1);
		expect(leaf?.textContent).toBe('first');
		state.value = 'next';
		flushSync();
		expect(reads).toBe(2);
		expect(host.querySelector('i')).toBe(leaf);
		expect(leaf?.textContent).toBe('next');
		expect(leaf && findElementOwner(leaf)).toBe(owner);
		unmount(host);
		state.value = 'disposed';
		flushSync();
		expect(reads).toBe(2);
		expect(host.childNodes).toHaveLength(0);
		expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
	} finally {
		unmount(host);
	}
});

it.each([false, true])(
	'keeps a newer same-recipe root handoff when the outer read throws=%s',
	(outerFailure) => {
		const host = document.createElement('div'),
			scopes: Array<EffectScope | undefined> = [],
			reports: unknown[] = [];
		const failure = new Error('outer acquisition'),
			options = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
		let reads = 0;
		const probe = {
			get value() {
				const ordinal = ++reads;
				scopes.push(currentEffectScope());
				if (ordinal === 1) {
					render(operation, host, options);
					if (outerFailure) throw failure;
				}
				return ordinal === 1 ? 'outer' : 'inner';
			}
		};
		const operation = receipt(ChildInputOwner, { probe });
		try {
			let caught: unknown;
			try {
				render(operation, host, options);
			} catch (error) {
				caught = error;
			}
			const leaf = host.querySelector('i'),
				owner = leaf && findElementOwner(leaf);
			expect(caught).toBe(outerFailure ? failure : undefined);
			expect(leaf?.textContent).toBe('inner');
			expect(reads).toBe(2);
			expect(scopes[0]?.active).toBe(false);
			expect(scopes[1]?.active).toBe(true);
			render(
				receipt(ChildInputOwner, {
					probe: {
						get value() {
							return 'next';
						}
					}
				}),
				host,
				options
			);
			expect(host.querySelector('i')).toBe(leaf);
			expect(leaf?.textContent).toBe('next');
			expect(leaf && findElementOwner(leaf)).toBe(owner);
			expect(reports).toEqual([]);
		} finally {
			unmount(host);
		}
		expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
	}
);

it('does not publish a root disposed by its own input acquisition', () => {
	const host = document.createElement('div'),
		scopes: Array<EffectScope | undefined> = [],
		reports: unknown[] = [];
	let reads = 0;
	const probe = {
		get value() {
			reads++;
			scopes.push(currentEffectScope());
			unmount(host);
			return 'disposed';
		}
	};
	try {
		render(receipt(ChildInputOwner, { probe }), host, {
			onErrorReport: (report) => reports.push(report.error)
		});
		expect(reads).toBe(1);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
		expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
	} finally {
		unmount(host);
	}
});

// Admission and acquisition precede structural adoption. An inner accepted handoff must win
// even when it reuses the exact same recipe and the outer acquisition subsequently throws.
it.each([false, true])(
	'keeps a newer same-recipe render during adoption, outer throw=%s',
	async (outerFailure) => {
		const host = document.createElement('div');
		host.innerHTML = (
			await renderToString(
				serverReceipt(ServerChildInputOwner, {
					probe: {
						get value() {
							return 'server';
						}
					}
				})
			)
		).html;
		const scopes: Array<EffectScope | undefined> = [],
			reports: unknown[] = [];
		const failure = new Error('superseded adoption');
		let reads = 0;
		const options = { onErrorReport: (report: { error: unknown }) => reports.push(report.error) };
		const probe = {
			get value() {
				const ordinal = ++reads;
				scopes.push(currentEffectScope());
				if (ordinal === 1) {
					render(operation, host, options);
					if (outerFailure) throw failure;
				}
				return ordinal === 1 ? 'outer' : 'inner';
			}
		};
		const operation = receipt(ChildInputOwner, { probe });
		try {
			expect(adoptCompiledComponentInputRoot(operation, host, options).outcome).toBe('superseded');
			const leaf = host.querySelector('i'),
				owner = leaf && findElementOwner(leaf);
			expect(leaf?.textContent).toBe('inner');
			expect(reads).toBe(2);
			expect(scopes[0]?.active).toBe(false);
			expect(scopes[1]?.active).toBe(true);
			render(
				receipt(ChildInputOwner, {
					probe: {
						get value() {
							return 'next';
						}
					}
				}),
				host,
				options
			);
			expect(host.querySelector('i')).toBe(leaf);
			expect(leaf?.textContent).toBe('next');
			expect(leaf && findElementOwner(leaf)).toBe(owner);
			expect(reports).toEqual([]);
		} finally {
			unmount(host);
		}
		expect(scopes.every((scope) => scope && !scope.active)).toBe(true);
	}
);

import {
	ChildInputLeaf,
	childInputLifetime
} from '../../component-composition-corpus/test-support/component-child-input.fixtures.js';
import { createComponentPropExpression } from '@exactjs/core/runtime/render-operations';
import { createEffectScope, withEffectScope, computed } from '@exactjs/reactive/framework/runtime';
import { componentReceiptInputs } from './renderer/component-receipt-inputs.js';
import {
	admitCompiledComponentInput,
	clientComponentRecipe
} from './renderer/component-input-admission.js';

it('acquires an eager marked child once per delivery and retains its mounted lifetime', () => {
	const host = document.createElement('div'),
		scope = createEffectScope();
	const state = reactive({ text: 'first' }),
		reports: unknown[] = [];
	let reads = 0;
	const operand = withEffectScope(scope, () =>
		createComponentPropExpression(() => {
			reads++;
			return [state.text];
		})
	);
	const before = { ...childInputLifetime };
	const operation = receipt(ChildInputLeaf, null, { kind: 'eager', values: [[operand]] });
	try {
		expect(reads).toBe(0);
		render(operation, host, { onErrorReport: (report) => reports.push(report.error) });
		const leaf = host.querySelector('i'),
			owner = leaf && findElementOwner(leaf);
		expect(reads).toBe(1);
		expect(leaf?.textContent).toBe('first');
		state.text = 'next';
		// This eager recipe has no lexical supplier membership. Its caller owns the next delivery.
		render(operation, host, { onErrorReport: (report) => reports.push(report.error) });
		flushSync();
		expect(reads).toBe(2);
		expect(host.querySelector('i')).toBe(leaf);
		expect(leaf && findElementOwner(leaf)).toBe(owner);
		expect(leaf?.textContent).toBe('next');
		expect(childInputLifetime.created - before.created).toBe(1);
		unmount(host);
		expect(childInputLifetime.disposed - before.disposed).toBe(1);
		// The caller releases its producer scope independently of the receiving lifetime.
		scope.stop();
		expect(scope.active).toBe(false);
		state.text = 'disposed';
		flushSync();
		expect(reads).toBe(2);
		expect(host.childNodes).toHaveLength(0);
		expect(reports).toEqual([]);
	} finally {
		unmount(host);
		scope.stop();
	}
});

it('does not acquire an authored reactive or callable payload beyond its compiler layer', () => {
	let authoredReads = 0,
		calls = 0;
	const authored = computed(() => ++authoredReads),
		callable = () => ++calls;
	const operand = createComponentPropExpression(() => [authored, callable]);
	const operation = receipt(ChildInputLeaf, null, { kind: 'eager', values: [operand] });
	const inputs = componentReceiptInputs(
		clientComponentRecipe(admitCompiledComponentInput(operation))
	);
	expect(inputs.children[0]).toBe(authored);
	expect(inputs.children[1]).toBe(callable);
	expect([authoredReads, calls]).toEqual([0, 0]);
});
