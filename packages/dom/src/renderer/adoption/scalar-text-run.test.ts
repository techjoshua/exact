/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { adoptScalarTextChildren, adoptCoalescedScalarTextRun } from './scalar-text-run.js';

it('validates the whole run before splitting server text', () => {
	const host = document.createElement('p');
	const original = document.createTextNode('abc');
	host.append(original);
	expect(adoptCoalescedScalarTextRun(['a', 'wrong'], 0, original, 'a')).toBeUndefined();
	expect(host.childNodes).toHaveLength(1);
	expect(original.data).toBe('abc');
	expect(adoptCoalescedScalarTextRun(['abcd', ''], 0, original, 'abcd')).toBeUndefined();
	expect(host.firstChild).toBe(original);
	expect(original.data).toBe('abc');
});

it('never coalesces across an opaque intrinsic operation', () => {
	const host = document.createElement('p');
	const original = document.createTextNode('ab');
	host.append(original);
	const opaque = createCompiledIntrinsicReceipt('b', {}, []);
	expect(adoptCoalescedScalarTextRun(['a', opaque, 'b'], 0, original, 'a')).toBeUndefined();
	expect(host.childNodes).toHaveLength(1);
	expect(original.data).toBe('ab');
});

it.each([
	['changed', 'longer'],
	['', '']
])(
	'applies an explicit render scalar run without using server string lengths: %j',
	(first, second) => {
		const host = document.createElement('p');
		host.textContent = 'server';
		const original = host.firstChild as Text,
			scope = createEffectScope();
		try {
			const adopted = adoptScalarTextChildren([first, second], 0, [original], 0, scope, first, {
				renderUpdate: () => scope.active
			});
			expect(adopted?.nextChild).toBe(2);
			expect(adopted?.next).toBe(1);
			expect(host.firstChild).toBe(original);
			expect(host.textContent).toBe(first + second);
			expect([...host.childNodes].map((node) => node.textContent)).toEqual([first, second]);
		} finally {
			scope.stop();
		}
	}
);

it('retains strict hydration matching and rejects stale render intent before scalar writes', () => {
	const host = document.createElement('p');
	host.textContent = 'server';
	const original = host.firstChild as Text,
		scope = createEffectScope();
	try {
		expect(adoptScalarTextChildren(['client'], 0, [original], 0, scope, 'client')).toBeUndefined();
		expect(
			adoptScalarTextChildren(['client'], 0, [original], 0, scope, 'client', {
				renderUpdate: () => false
			})
		).toBeUndefined();
		expect(host.firstChild).toBe(original);
		expect(host.textContent).toBe('server');
		expect(
			adoptScalarTextChildren(['client'], 0, [], 0, scope, 'client', {
				physicalParent: host,
				renderUpdate: () => true
			})
		).toBeUndefined();
		expect(host.textContent).toBe('server');
	} finally {
		scope.stop();
	}
});

it('keeps opaque structure outside the explicit render scalar run', () => {
	const host = document.createElement('p');
	host.innerHTML = 'server<b>fixed</b>';
	const nodes = [...host.childNodes],
		scope = createEffectScope();
	try {
		const opaque = createCompiledIntrinsicReceipt('b', {}, ['fixed']);
		const adopted = adoptScalarTextChildren(['new', opaque], 0, nodes, 0, scope, 'new', {
			renderUpdate: () => true
		});
		expect(adopted?.nextChild).toBe(1);
		expect(adopted?.next).toBe(1);
		expect(host.firstChild).toBe(nodes[0]);
		expect(host.lastChild).toBe(nodes[1]);
		expect(host.innerHTML).toBe('new<b>fixed</b>');
	} finally {
		scope.stop();
	}
});
