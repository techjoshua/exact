/** @vitest-environment jsdom */
import { it, expect } from 'vitest';
import { unwrap, flushSync } from '@exactjs/reactive';
import { mounted } from '../test-support/array-completion-fixture.js';
it.each(['helper', 'direct', 'reverted', 'replace', 'prewrite'])(
	'runs %s completion, next interaction, identity and cleanup',
	async (mode) => {
		const f = await mounted('completion', mode);
		f.click();
		await f.client.whenSettled();
		flushSync();
		expect(f.reports).toEqual([]);
		const rows = f.state.rows as { label: string }[];
		if (mode === 'replace') {
			expect(unwrap(rows)).not.toBe(f.initial);
			expect(rows.map((r) => r.label)).toEqual(['R', 'C']);
		} else {
			expect(unwrap(rows)).toBe(f.initial);
			expect(unwrap(rows[0])).toBe(f.initialMembers[0]);
			expect(unwrap(rows[1])).toBe(f.initialMembers[1]);
			expect(rows.length).toBe(mode === 'reverted' || mode === 'prewrite' ? 2 : 3);
		}
		expect(f.container.querySelector('output')).toBe(f.output);
		// A fresh ordinary interaction uses the committed correspondence, not the previous response's released record.
		f.container.querySelector<HTMLButtonElement>('[data-mode="direct"]')!.click();
		await f.client.whenSettled();
		flushSync();
		expect(f.reports).toEqual([]);
		expect((f.state.rows as unknown[]).length).toBe(
			mode === 'reverted' || mode === 'prewrite' || mode === 'replace' ? 3 : 4
		);
		f.client.dispose();
		expect(f.container.querySelector('button')).toBeNull();
	}
);
it('preserves a newer local field on a net-empty in-place completion', async () => {
	const f = await mounted('completion', 'noop');
	f.click();
	await expect.poll(() => (f.mod.server.gates as Map<string, () => void>).has('noop')).toBe(true);
	(f.state.rows as { label: string }[])[0]!.label = 'local';
	(f.mod.server.gates as Map<string, () => void>).get('noop')!();
	await f.client.whenSettled();
	flushSync();
	expect((f.state.rows as { label: string }[])[0]!.label).toBe('local');
	expect(f.reports).toEqual([]);
	expect(JSON.parse((f.responses[0] as { body: string }).body).mutations).toBeUndefined();
});
it('authoritative server move preserves newer retained payload and original object identities', async () => {
	const f = await mounted('completion', 'move');
	f.click();
	await expect.poll(() => (f.mod.server.gates as Map<string, () => void>).has('move')).toBe(true);
	const rows = f.state.rows as { label: string }[];
	rows[0]!.label = 'local';
	rows.reverse();
	(f.mod.server.gates as Map<string, () => void>).get('move')!();
	await f.client.whenSettled();
	flushSync();
	expect(unwrap(rows[0])).toBe(f.initialMembers[1]);
	expect(unwrap(rows[1])).toBe(f.initialMembers[0]);
	expect(rows[1]!.label).toBe('local');
	expect(f.reports).toEqual([]);
});
it('publishes out-of-order independent keyed completions, retains identity and supports the next interaction', async () => {
	const f = await mounted('ordering');
	f.container.querySelector<HTMLButtonElement>('[data-a]')!.click();
	f.container.querySelector<HTMLButtonElement>('[data-b]')!.click();
	const gates = f.mod.server.gates as Map<string, () => void>;
	await expect.poll(() => gates.has('aA1') && gates.has('bB2')).toBe(true);
	expect(f.requests).toHaveLength(2);
	expect(f.responses).toEqual([]);
	gates.get('bB2')!();
	await expect.poll(() => f.responses.length).toBe(1);
	await expect.poll(() => f.output?.textContent).toBe('A:B2');
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(unwrap((f.state.rows as unknown[])[0])).toBe(f.initialMembers[0]);
	expect(unwrap((f.state.rows as unknown[])[1])).toBe(f.initialMembers[1]);
	gates.get('aA1')!();
	await f.client.whenSettled();
	flushSync();
	await expect.poll(() => f.output?.textContent).toBe('A1:B2');
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(unwrap((f.state.rows as unknown[])[0])).toBe(f.initialMembers[0]);
	expect(unwrap((f.state.rows as unknown[])[1])).toBe(f.initialMembers[1]);
	expect(f.responses.map((r) => JSON.parse((r as { body: string }).body).value)).toEqual([
		'B2',
		'A1'
	]);
	f.container.querySelector<HTMLButtonElement>('[data-next]')!.click();
	await expect.poll(() => gates.has('aA3')).toBe(true);
	gates.get('aA3')!();
	await f.client.whenSettled();
	flushSync();
	await expect.poll(() => f.output?.textContent).toBe('A3:B2');
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(unwrap((f.state.rows as unknown[])[0])).toBe(f.initialMembers[0]);
	expect(unwrap((f.state.rows as unknown[])[1])).toBe(f.initialMembers[1]);
	expect(f.requests).toHaveLength(3);
	const id = (f.requests[0] as { id: string }).id;
	expect(f.requests).toMatchObject(
		Array.from({ length: 3 }, () => ({ type: 'invoke', id, arrayCompletion: 4 }))
	);
	expect(f.responses).toMatchObject(Array.from({ length: 3 }, () => ({ status: 200 })));
	expect(f.responses.map((r) => JSON.parse((r as { body: string }).body))).toMatchObject(
		['B2', 'A1', 'A3'].map((value) => ({ ok: true, id, arrayCompletion: 4, value }))
	);
	expect(f.mod.client.completions).toEqual(['B2', 'A1', 'A3']);
	expect(f.mod.server.cleaned).toEqual(['bB2', 'aA1', 'aA3']);
	expect(f.reports).toEqual([]);
	expect(f.client.pendingRequests).toBe(0);
	f.client.dispose();
	expect(f.container.querySelector('button')).toBeNull();
	await expect(f.client.invokeTask(id, { dependencies: [] })).rejects.toThrow('disposed');
	expect(f.requests).toHaveLength(3);
	f.container.remove();
	expect(f.container.isConnected).toBe(false);
});
it.each(['partial', 'override'] as const)(
	'publishes %s native behavior through the exported dispatch owner',
	async (constraint) => {
		const f = await mounted('completion', constraint, constraint);
		f.click();
		await f.client.whenSettled();
		flushSync();
		expect(f.reports).toEqual([]);
		expect(unwrap(f.state.rows)).toBe(f.initial);
		expect((f.state.rows as unknown[]).length).toBe(3);
		expect(unwrap((f.state.rows as unknown[])[0])).toBe(f.initialMembers[0]);
		expect(unwrap((f.state.rows as unknown[])[1])).toBe(f.initialMembers[1]);
		const response = JSON.parse((f.responses[0] as { body: string }).body);
		expect(response.ok).toBe(true);
		expect(response.value).toBe(constraint === 'partial' ? 3 : 103);
		expect(response.mutations[0].operation).toBe('array-net');
		if (constraint === 'partial') {
			expect((f.state.rows as { label: string }[]).map((row) => row.label)).toEqual([
				'A',
				'B',
				'B'
			]);
			expect(unwrap((f.state.rows as unknown[])[2])).not.toBe(f.initialMembers[1]);
			expect(Object.getOwnPropertyDescriptor(unwrap(f.state.rows), '1')!.writable).toBe(true);
		}
	}
);
it('retains scalar equal-performed assignment semantics inside completion', async () => {
	const hold = { value: true, release: undefined as undefined | (() => void) },
		f = await mounted('completion', 'same', undefined, hold);
	f.click();
	await expect.poll(() => f.responses.length).toBe(1);
	(f.state.rows as { label: string }[])[0]!.label = 'local';
	hold.release!();
	await f.client.whenSettled();
	flushSync();
	expect((f.state.rows as { label: string }[])[0]!.label).toBe('A');
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(f.reports).toEqual([]);
});
it.each(['none', 'sibling'])(
	'keeps committed immediate child effects after caught cancellation, %s',
	async (mode) => {
		const f = await mounted('child');
		f.state.mode = mode;
		f.click();
		const gates = f.mod.server.gates as Map<string, () => void>;
		await expect.poll(() => gates.has('child')).toBe(true);
		if (mode === 'sibling') {
			await expect.poll(() => gates.has('sibling')).toBe(true);
			gates.get('sibling')!();
		}
		await f.client.whenSettled();
		flushSync();
		const expected = mode === 'sibling' ? [0, 11, 22, 122] : [0, 11];
		expect(f.state.values).toEqual(expected);
		expect(unwrap(f.state.values)).toBe(f.initial);
		expect(f.reports).toEqual([]);
		gates.get('child')!();
		await Promise.resolve();
		await Promise.resolve();
		const raw = (f.mod.server.observations as { label: string; receiver: number[] }[]).find(
			(value) => value.label === 'child:native-return'
		)!.receiver;
		expect(raw).toEqual(expected);
		f.state.mode = 'next';
		f.click();
		await expect.poll(() => gates.has('next')).toBe(true);
		gates.get('next')!();
		await f.client.whenSettled();
		flushSync();
		expect(f.state.values).toEqual([...expected, 33, 133]);
		expect(f.reports).toEqual([]);
	}
);

it('fails an uncaught server mutation without publishing its request-local Array', async () => {
	const f = await mounted('completion', 'uncaught');
	f.click();
	await f.client.whenSettled().catch(() => undefined);
	flushSync();
	expect((f.responses[0] as { status: number }).status).toBe(500);
	await expect.poll(() => f.reports.length).toBeGreaterThan(0);
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(f.initial).toHaveLength(2);
});
it('fails an unobserved canceled child structurally without terminal publication', async () => {
	const f = await mounted('child');
	f.state.mode = 'unobserved';
	f.click();
	await f.client.whenSettled().catch(() => undefined);
	flushSync();
	expect((f.responses[0] as { status: number }).status).toBe(500);
	expect(f.state.values).toEqual([0]);
	await expect.poll(() => f.reports.length).toBeGreaterThan(0);
	(f.mod.server.gates as Map<string, () => void>).get('child')?.();
});
it('root cancellation releases owned work and produces no terminal success', async () => {
	const f = await mounted('child');
	f.state.mode = 'root';
	f.click();
	await expect
		.poll(() =>
			(f.mod.server.observations as { label: string }[]).some(
				(v) => v.label === 'child:native-return'
			)
		)
		.toBe(true);
	f.client.dispose();
	await expect.poll(() => (f.mod.server.cleaned as string[]).includes('parent')).toBe(true);
	(f.mod.server.gates as Map<string, () => void>).get('child')?.();
	await Promise.resolve();
	await Promise.resolve();
	expect(f.state.values).toEqual([0]);
	expect(f.responses.every((r) => (r as { status: number }).status !== 200)).toBe(true);
	expect(f.mod.server.cleaned).toContain('child');
});

it.each(['MemberDirect', 'MemberHelper', 'TupleMember'])(
	'%s preserves browser reorder without an Array transport read',
	async (name) => {
		const hold = { value: true };
		const f = await mounted('member-only', undefined, undefined, hold, name);
		f.click();
		await expect.poll(() => Boolean((hold as { release?: () => void }).release)).toBe(true);
		const rows = f.state.rows as { label: string }[];
		rows.reverse();
		(hold as { release?: () => void }).release!();
		await f.client.whenSettled();
		flushSync();
		expect(unwrap(f.state.rows)).toBe(f.initial);
		expect(unwrap(rows[0])).toBe(f.initialMembers[1]);
		expect(unwrap(rows[1])).toBe(f.initialMembers[0]);
		expect(rows[1]!.label).toBe('changed');
		expect(f.reports).toEqual([]);
		expect((f.requests[0] as { state?: unknown }).state).toBeUndefined();
	}
);

it.each(['same', 'delete', 'member-delete', 'named-set', 'named-delete'])(
	'preserves explicit scalar slot semantics: %s',
	async (mode) => {
		const f = await mounted('scalar', mode);
		f.click();
		await expect.poll(() => (f.mod.server.gates as Map<string, () => void>).has(mode)).toBe(true);
		const rows = f.state.rows as { label: string; optional?: string }[];
		if (mode === 'same') rows[0]!.label = 'local';
		if (mode === 'delete') rows.push({ label: 'C' }, { label: 'D' });
		if (mode === 'member-delete') rows[0]!.optional = 'local';
		if (mode === 'named-delete') rows[4294967295] = { label: 'local' };
		(f.mod.server.gates as Map<string, () => void>).get(mode)!();
		await f.client.whenSettled();
		flushSync();
		expect(f.reports).toEqual([]);
		expect(unwrap(rows)).toBe(f.initial);
		if (mode === 'same') {
			expect(unwrap(rows[0])).not.toBe(f.initialMembers[0]);
			expect(rows[0]!.label).toBe('A');
			expect(unwrap(rows[1])).toBe(f.initialMembers[1]);
		}
		if (mode === 'delete') {
			expect(rows.length).toBe(4);
			expect(Object.hasOwn(unwrap(rows), 3)).toBe(false);
			expect(rows[2]!.label).toBe('C');
		}
		if (mode === 'member-delete') {
			expect(Object.hasOwn(unwrap(rows[0]), 'optional')).toBe(false);
			expect(unwrap(rows[0])).toBe(f.initialMembers[0]);
		}
		if (mode === 'named-set') expect(rows[4294967295]).toEqual({ label: 'N' });
		if (mode === 'named-delete') expect(Object.hasOwn(unwrap(rows), 4294967295)).toBe(false);
	}
);
it.each([
	'direct-none',
	'direct-equal',
	'direct-replace',
	'helper-none',
	'helper-equal',
	'helper-replace'
])('preserves scalar ancestor precedence: %s', async (mode) => {
	const f = await mounted('ancestor', mode),
		group = unwrap(f.state.group);
	f.click();
	await f.client.whenSettled();
	flushSync();
	expect(f.output?.textContent).toBe(mode.endsWith('replace') ? '1' : '2');
	expect(f.state.group.rows).toEqual(mode.endsWith('replace') ? [1] : [0, 1]);
	const response = JSON.parse((f.responses[0] as { body: string }).body);
	if (mode.endsWith('none')) {
		expect(unwrap(f.state.group)).toBe(group);
		expect(unwrap(f.state.group.rows)).toBe(f.initial);
		expect(response.state).toBeUndefined();
		expect(response.mutations).toMatchObject([{ operation: 'array-net', path: 'group.rows' }]);
	} else {
		expect(unwrap(f.state.group)).not.toBe(group);
		expect(response.mutations).toBeUndefined();
		expect(response.state).toEqual({ group: { rows: mode.endsWith('replace') ? [1] : [0, 1] } });
	}
});

it('coalesces changed duplicate edges on original canonical objects', async () => {
	const f = await mounted('duplicates');
	f.state.rows[1] = f.state.rows[0];
	const a = unwrap(f.state.rows[0]),
		q = unwrap(a.edge);
	f.click();
	await f.client.whenSettled();
	flushSync();
	expect(unwrap(f.state.rows)).toBe(f.initial);
	expect(unwrap(f.state.rows[0])).toBe(a);
	expect(unwrap(f.state.rows[1])).toBe(a);
	expect(unwrap(a.edge)).toBe(q);
	expect(q).toEqual({ street: 'new', local: 'keep' });
	expect(f.reports).toEqual([]);
	const response = JSON.parse((f.responses[0] as { body: string }).body);
	expect(response.deletions).toBeUndefined();
	expect(response.mutations).toMatchObject([{ operation: 'array-net', path: 'rows' }]);
	f.click();
	await f.client.whenSettled();
	flushSync();
	expect(unwrap(a.edge)).toBe(q);
	expect(q.street).toBe('new');
	expect(f.reports).toEqual([]);
});
