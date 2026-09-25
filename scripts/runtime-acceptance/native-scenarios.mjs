import assert from 'node:assert/strict';
import { invokeExactBatch } from '../../packages/hydrate/dist/invocations.js';

/** Bounds fixture metadata and control requests as well as the streamed invocations. */
const fetch = (url, options = {}) =>
	globalThis.fetch(url, { signal: AbortSignal.timeout(10000), ...options });

/** Exercises real HTTP progress, final failure, cancellation, fallback, and the next invocation. */
export async function checkNativeProgress(origin, control) {
	const metadata = await (await fetch(new URL('/contract', origin))).json();
	const invoke = async (id, mode = 'normal', signal = AbortSignal.timeout(10000)) => {
		const response = await fetch(new URL(mode === 'buffered' ? '/buffered' : '/__exact', origin), {
			method: 'POST',
			signal,
			headers: {
				'content-type': 'application/json',
				accept: 'application/x-ndjson',
				'x-exact-progress': '1'
			},
			body: JSON.stringify({
				type: 'invoke',
				id: metadata.id,
				state: {},
				payload: { dependencies: [id, mode] }
			})
		});
		assert.equal(response.status, 200, response.ok ? '' : id + ': ' + (await response.text()));
		return response.body.getReader();
	};
	const release = async (id) => {
		const response = await fetch(new URL('/release?id=' + id, control), {
			signal: AbortSignal.timeout(5000)
		});
		await response.text();
	};
	const read = async (reader, onProgress) => {
		let pending = '';
		const events = [];
		const decoder = new TextDecoder();
		try {
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				pending += decoder.decode(chunk.value, { stream: true });
				let end;
				while ((end = pending.indexOf('\n')) >= 0) {
					const event = JSON.parse(pending.slice(0, end));
					pending = pending.slice(end + 1);
					events.push(event);
					if (event.event === 'progress') await onProgress(event);
				}
			}
			assert.equal(pending, '');
			return events;
		} finally {
			await reader.cancel();
			reader.releaseLock();
		}
	};
	for (const [id, mode] of [
		[1, 'normal'],
		[2, 'fail'],
		[3, 'buffered'],
		[4, 'normal']
	]) {
		if (mode === 'buffered') await release(id);
		let progressed = false;
		const events = await read(await invoke(id, mode), async (event) => {
			assert.equal(mode === 'buffered', false);
			assert.deepEqual(event.snapshot, { completed: 42, id });
			progressed = true;
			await release(id);
		});
		assert.equal(progressed, mode !== 'buffered');
		assert.equal(events.at(-1).event, 'complete');
		const result = events.find((event) => event.event === 'result').result;
		assert.equal(result.ok, mode !== 'fail');
		if (result.ok) assert.equal(result.value, id);
	}
	// Cancel only after observing progress, while the server's fetch is still gated.
	const abort = new AbortController();
	const deadline = setTimeout(() => abort.abort(), 10000);
	try {
		await assert.rejects(
			read(await invoke(5, 'normal', abort.signal), async (event) => {
				assert.equal(event.snapshot.id, 5);
				const gateDeadline = Date.now() + 5000;
				let gateStatus;
				do {
					gateStatus = await (await fetch(new URL('/status', control))).json();
					if (gateStatus.pending.includes('5')) break;
					await new Promise((resolve) => setTimeout(resolve, 20));
				} while (Date.now() < gateDeadline);
				assert.ok(
					gateStatus.pending.includes('5'),
					'Cancellation witness must start its pending fetch'
				);
				abort.abort();
			}),
			(error) => error.name === 'AbortError'
		);
	} finally {
		clearTimeout(deadline);
	}
	const until = Date.now() + 5000;
	let status;
	do {
		status = await (await fetch(new URL('/runs', origin))).json();
		if (status.cleaned.some((item) => item.id === 5 && item.aborted)) break;
		await new Promise((resolve) => setTimeout(resolve, 20));
	} while (Date.now() < until);
	assert.ok(
		status.cleaned.some((item) => item.id === 5 && item.aborted),
		'Disconnect must abort and clean up server task: ' + JSON.stringify(status)
	);
	await release(5);
	await read(await invoke(6), async () => release(6));
	assert.equal((await (await fetch(new URL('/runs', origin))).json()).runs, 6, 'No task replay');

	// Use the published client transport, not a parallel NDJSON reader, for batch routing.
	const batchAbort = new AbortController();
	const batchDeadline = setTimeout(() => batchAbort.abort(), 10000);
	const observed = new Set();
	const closed = new Set();
	const releases = [];
	try {
		const results = await invokeExactBatch({
			endpoint: new URL('/__exact', origin).href,
			stream: true,
			signal: batchAbort.signal,
			operations: [7, 8].map((id) => ({
				type: 'invoke',
				id: metadata.id,
				state: {},
				payload: { dependencies: [id, 'normal'] }
			})),
			progress: [7, 8].map((id) => ({
				receivers: metadata.receivers,
				report(receiver, snapshot) {
					assert.ok(metadata.receivers.includes(receiver));
					assert.deepEqual(snapshot, { completed: 42, id });
					assert.ok(!closed.has(id), 'No progress after terminal settlement');
					if (observed.has(id)) return;
					observed.add(id);
					releases.push(release(id).catch((error) => batchAbort.abort(error)));
				},
				close() {
					closed.add(id);
				}
			}))
		});
		assert.deepEqual(
			results.map((result) => result.value),
			[7, 8]
		);
		assert.ok(results.every((result) => result.ok));
		assert.deepEqual([...observed].sort(), [7, 8]);
		assert.deepEqual([...closed].sort(), [7, 8]);
	} finally {
		clearTimeout(batchDeadline);
		batchAbort.abort();
		await Promise.all(releases);
	}
	assert.equal((await (await fetch(new URL('/runs', origin))).json()).runs, 8, 'No batch replay');
	const warnings = await (await fetch(new URL('/warnings', origin))).json();
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /NativeProgress.report/);
	assert.match(warnings[0], /buffers/);
}
