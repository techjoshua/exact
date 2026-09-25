import assert from 'node:assert/strict';
import { request, json } from './test-support.mjs';

/** Exercises real host parsing, allowlists, security hooks, JSON boundaries and context ownership. */
export async function checkDispatch(origin, control) {
	let sequence = 0;
	const invoke = (id, payload = {}, headers = {}, raw) =>
		request(new URL('/operations', origin), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-request-id': 'operation-' + ++sequence,
				...headers
			},
			body: raw ?? JSON.stringify({ type: 'invoke', id, payload })
		});
	const state = async () => json(await request(new URL('/operation-state', origin)));
	const before = (await state()).executed;
	for (const [body, status] of [
		['{', 400],
		[JSON.stringify({ type: 'invoke', id: 'missing', payload: {} }), 404],
		[JSON.stringify({ type: 'invoke', id: 'echo', payload: {}, module: 'private.js' }), 400],
		[JSON.stringify({ type: 'invoke', id: 'echo', payload: 42 }), 400]
	])
		await json(await invoke('echo', {}, {}, body), status);
	for (const deny of ['request', 'operation', 'csrf'])
		await json(await invoke('echo', {}, { 'x-deny': deny }), 403);
	assert.equal(
		(await state()).executed,
		before,
		'Rejected requests must not execute application code'
	);
	const payload = JSON.parse(
		'{"text":"café 😀 </script>","values":[null,true,2.5],"__proto__":{"polluted":true}}'
	);
	assert.deepEqual((await json(await invoke('echo', payload))).value, payload);
	for (const id of ['failure', 'unsafe']) {
		const response = await invoke(id);
		const text = await response.text();
		assert.equal(response.status, 500, text);
		assert.doesNotMatch(text, /private server failure sentinel|<script>/);
	}
	// Concurrent request-owned scopes must survive awaits without borrowing a neighbor's identity.
	const first = invoke('context', { gate: 'context-a' }, { 'x-request-id': 'context-a' });
	const second = invoke('context', { gate: 'context-b' }, { 'x-request-id': 'context-b' });
	try {
		const deadline = Date.now() + 5000;
		while (true) {
			const pending = await json(await request(new URL('/status', control)));
			if (['context-a', 'context-b'].every((id) => pending.pending.includes(id))) break;
			assert.ok(Date.now() < deadline, 'Both requests must reach their owned upstream work');
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	} finally {
		for (const id of ['context-a', 'context-b'])
			await (await request(new URL('/release?id=' + id, control))).text();
	}
	for (const [response, id] of [
		[await first, 'context-a'],
		[await second, 'context-b']
	]) {
		assert.equal(response.headers.get('x-native-request'), id);
		assert.deepEqual((await json(response)).value, { id, prefix: 'application', aborted: false });
	}
	assert.equal((await json(await invoke('echo', { after: true }))).value.after, true);
	const final = await state();
	assert.equal(final.prototypePolluted, false, 'JSON data must not mutate the server prototype');
	assert.equal(final.initialized, 1, 'Application context must be retained across requests');
	assert.equal(
		final.created.length,
		final.disposed.length,
		'Every request context must be disposed'
	);
	assert.equal(
		new Set(final.disposed.map((value) => value.id)).size,
		final.created.length,
		'No double disposal'
	);
	assert.ok(
		final.disposed.every((value) => value.aborted),
		'Disposal must end each request lifetime'
	);
}
