// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { installExactDevtoolsRuntime } from './runtime.js';

let installation: ReturnType<typeof installExactDevtoolsRuntime> | undefined;
afterEach(async () => {
	await installation?.dispose();
	installation = undefined;
});

function deferredResponse() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function opened(id: string): Response {
	return Response.json({
		session: {
			id,
			protocol: 1,
			openedAt: 1,
			expiresAt: Date.now() + 60000,
			capabilities: ['catalog']
		}
	});
}

it('shares one session opening across concurrent connections', async () => {
	const opening = deferredResponse();
	const fetch = vi.fn<typeof globalThis.fetch>(async (_url, options) => {
		const body = JSON.parse(String(options?.body));
		return body.request === 'open'
			? opening.promise.then((response) => response.clone())
			: Response.json({ ok: true });
	});
	installation = installExactDevtoolsRuntime({ endpoint: '/__exact', fetch });
	const first = installation.hook.connect();
	const second = installation.hook.connect();
	opening.resolve(opened('shared'));
	expect(await first).toBe(await second);
	expect(
		fetch.mock.calls.filter(([, options]) => JSON.parse(String(options?.body)).request === 'open')
	).toHaveLength(1);
});

it.each(['disconnect', 'dispose'] as const)(
	'does not attach a session after %s during opening',
	async (action) => {
		const opening = deferredResponse();
		const closed: string[] = [];
		const fetch: typeof globalThis.fetch = async (_url, options) => {
			const body = JSON.parse(String(options?.body));
			if (body.request === 'open') return opening.promise.then((response) => response.clone());
			closed.push(body.sessionId);
			return Response.json({ ok: true });
		};
		installation = installExactDevtoolsRuntime({ endpoint: '/__exact', fetch });
		const result = installation.hook.connect().then(
			(value) => ({ value }),
			(error) => ({ error })
		);
		if (action === 'dispose') await installation.dispose();
		else await installation.hook.disconnect();
		opening.resolve(opened('stale'));
		expect(await result).toMatchObject({ error: { name: 'AbortError' } });
		expect(installation.hook.connected).toBe(false);
		expect(closed).toEqual(['stale']);
		if (action === 'dispose')
			await expect(installation.hook.connect()).rejects.toMatchObject({ name: 'AbortError' });
		else expect((await installation.hook.connect()).id).toBe('stale');
	}
);

it('keeps a new connection when an older remote close finishes', async () => {
	const closing = deferredResponse();
	let opens = 0;
	const fetch: typeof globalThis.fetch = async (_url, options) => {
		const body = JSON.parse(String(options?.body));
		return body.request === 'open'
			? opened('session-' + ++opens)
			: closes++ === 0
				? closing.promise
				: Response.json({ ok: true });
	};
	let closes = 0;
	installation = installExactDevtoolsRuntime({ endpoint: '/__exact', fetch });
	expect((await installation.hook.connect()).id).toBe('session-1');
	const disconnect = installation.hook.disconnect();
	expect(installation.hook.connected).toBe(false);
	expect((await installation.hook.connect()).id).toBe('session-2');
	closing.resolve(Response.json({ ok: true }));
	await disconnect;
	expect(installation.hook.connected).toBe(true);
	expect((await installation.hook.connect()).id).toBe('session-2');
});

it('rejects an older opening without clearing the new pending generation', async () => {
	const first = deferredResponse();
	const second = deferredResponse();
	let opens = 0;
	const closed: string[] = [];
	const fetch: typeof globalThis.fetch = async (_url, options) => {
		const body = JSON.parse(String(options?.body));
		if (body.request === 'open') return ++opens === 1 ? first.promise : second.promise;
		closed.push(body.sessionId);
		return Response.json({ ok: true });
	};
	installation = installExactDevtoolsRuntime({ endpoint: '/__exact', fetch });
	const older = installation.hook.connect().then(
		() => 'unexpected',
		(error) => error.name
	);
	await installation.hook.disconnect();
	const newer = installation.hook.connect();
	first.resolve(opened('older'));
	expect(await older).toBe('AbortError');
	const shared = installation.hook.connect();
	expect(opens).toBe(2);
	second.resolve(opened('newer'));
	expect(await shared).toBe(await newer);
	expect(closed).toEqual(['older']);
});

it('fences an opening without server cooperation and permits a fresh local session', async () => {
	installation = installExactDevtoolsRuntime();
	const older = installation.hook.connect().then(
		() => 'unexpected',
		(error) => error.name
	);
	await installation.hook.disconnect();
	expect(await older).toBe('AbortError');
	const current = await installation.hook.connect();
	expect(current.id).toMatch(/^client-/);
	expect(installation.hook.connected).toBe(true);
});
