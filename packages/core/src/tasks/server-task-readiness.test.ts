import { expect, it } from 'vitest';
import { ServerTaskReadiness } from './server-task-readiness.js';

function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

it('does not allocate a wait for absent or already completed task work', async () => {
	const state = new ServerTaskReadiness();
	expect(state.wait()).toBeUndefined();
	let resolve!: () => void;
	const gate = {
		promise: new Promise<void>((accept) => {
			resolve = accept;
		}),
		resolve: () => resolve()
	};
	state.observe(gate.promise);
	expect(state.wait()).toBeInstanceOf(Promise);
	gate.resolve();
	await gate.promise;
	expect(state.wait()).toBeUndefined();
	expect(state.version).toBe(1);
});

it('retains task failure even after the pending work is removed', async () => {
	const state = new ServerTaskReadiness();
	const error = new Error('task failed');
	state.observe(Promise.reject(error));
	await Promise.resolve();
	expect(() => state.wait()).toThrow(error);
	expect(state.version).toBe(1);
});

it('waits only for selected identities and ignores unrelated completion revisions', async () => {
	const state = new ServerTaskReadiness(true);
	const head = deferred();
	const body = deferred();
	const selection = new Set(['head']);
	state.observe(head.promise, 'head');
	state.observe(body.promise, 'body');
	const version = state.versionFor(selection);
	const pending = state.wait(selection);
	expect(state.wait(new Set())).toBeUndefined();
	body.resolve();
	await body.promise;
	expect(state.versionFor(selection)).toBe(version);
	expect(state.wait(selection)).toBeInstanceOf(Promise);
	head.resolve();
	await pending;
	expect(state.versionFor(selection)).toBe(version + 1);
	expect(state.wait(selection)).toBeUndefined();
});

it('keeps a selected wait independent of still-pending unrelated work', async () => {
	const state = new ServerTaskReadiness(true);
	const head = deferred();
	const body = deferred();
	state.observe(head.promise, 'head');
	state.observe(body.promise, 'body');
	try {
		const pending = state.wait(new Set(['head']));
		head.resolve();
		await pending;
		expect(state.wait(new Set(['head']))).toBeUndefined();
		expect(state.wait()).toBeInstanceOf(Promise);
	} finally {
		body.resolve();
		await body.promise;
	}
});

it('retains selected failures without rejecting an unrelated selection', async () => {
	const state = new ServerTaskReadiness(true);
	const failure = new Error('body failed');
	state.observe(Promise.reject(failure), 'body');
	await Promise.resolve();
	expect(state.wait(new Set(['head']))).toBeUndefined();
	expect(() => state.wait(new Set(['body']))).toThrow(failure);
	expect(() => state.wait()).toThrow(failure);
});

it('rechecks repeated activations and includes unidentified work in every selection', async () => {
	const state = new ServerTaskReadiness(true);
	const selection = new Set(['head']);
	const first = deferred();
	const second = deferred();
	state.observe(first.promise, 'head');
	const version = state.versionFor(selection);
	const initialWait = state.wait(selection);
	state.observe(second.promise, 'head');
	first.resolve();
	await initialWait;
	expect(state.versionFor(selection)).toBe(version + 1);
	expect(state.wait(selection)).toBeInstanceOf(Promise);
	second.resolve();
	await state.wait(selection);
	expect(state.versionFor(selection)).toBe(version + 2);
	const unknown = deferred();
	state.observe(unknown.promise);
	expect(state.wait(new Set())).toBeInstanceOf(Promise);
	unknown.resolve();
	await unknown.promise;
	expect(state.versionFor(selection)).toBe(version + 3);
	state.observe(Promise.reject('unknown failure'));
	await Promise.resolve();
	expect(() => state.wait(new Set())).toThrow('unknown failure');
});

it('requires compiler-selected identity tracking before accepting a selection', () => {
	const state = new ServerTaskReadiness();
	expect(() => state.wait(new Set())).toThrow('requires identity tracking');
	expect(() => state.versionFor(new Set())).toThrow('requires identity tracking');
	expect(state.wait()).toBeUndefined();
});
