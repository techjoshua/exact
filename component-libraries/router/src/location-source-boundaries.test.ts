// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import {
	createMemoryLocationSource,
	createBrowserLocationSource
} from './core/location-sources.js';
import { createExactRouter } from './core/router.js';

it.each([NaN, 0.5, -0.5, -1, 2, Infinity])('rejects invalid initial history index %s', (index) => {
	expect(() => createMemoryLocationSource(['/first', '/second'], index)).toThrow(RangeError);
});

it.each([NaN, Infinity, -Infinity, 0.5, -0.5, Number.MAX_SAFE_INTEGER + 1])(
	'rejects invalid history delta %s without changing retained location',
	(delta) => {
		const source = createMemoryLocationSource(['/first', '/second'], 1);
		const initial = source.location();
		const listener = vi.fn();
		source.subscribe?.(listener);
		expect(() => source.go?.(delta)).toThrow(RangeError);
		expect(source.location()).toBe(initial);
		expect(source.index()).toBe(1);
		expect(listener).not.toHaveBeenCalled();
		source.go?.(-1);
		expect(source.location().pathname).toBe('/first');
		expect(listener).toHaveBeenCalledOnce();
	}
);

it('rejects invalid browser and custom-source navigation before forwarding it', async () => {
	const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
	try {
		const browser = createBrowserLocationSource()!;
		const custom = { ...createMemoryLocationSource('/first'), go: vi.fn() };
		const router = createExactRouter({ source: custom, routes: [] });
		for (const delta of [NaN, Infinity, -0.5, Number.MAX_SAFE_INTEGER + 1]) {
			expect(() => browser.go?.(delta)).toThrow(RangeError);
			await expect(router.navigate(delta)).rejects.toThrow(RangeError);
		}
		expect(go).not.toHaveBeenCalled();
		expect(custom.go).not.toHaveBeenCalled();
		browser.go?.(-1);
		await router.navigate(-1);
		expect(go).toHaveBeenCalledWith(-1);
		expect(custom.go).toHaveBeenCalledWith(-1);
		router.dispose();
	} finally {
		go.mockRestore();
	}
});

it('retains valid first and default last indices and integer delta boundaries', () => {
	const first = createMemoryLocationSource(['/first', '/second'], 0);
	const last = createMemoryLocationSource(['/first', '/second']);
	expect(first.location().pathname).toBe('/first');
	expect(last.location().pathname).toBe('/second');
	first.go?.(1);
	expect(first.location().pathname).toBe('/second');
	first.go?.(0);
	expect(first.location().pathname).toBe('/second');
});

function trackedRouter() {
	const source = createMemoryLocationSource('/first');
	const subscribe = source.subscribe!;
	const counts = { acquired: 0, released: 0 };
	source.subscribe = (listener) => {
		counts.acquired++;
		const stop = subscribe(listener);
		return () => {
			counts.released++;
			stop();
		};
	};
	return { source, counts, router: createExactRouter({ source, routes: [] }) };
}

it('allows decorating router cleanup while retaining navigation and source ownership', async () => {
	const { router, source, counts } = trackedRouter();
	const dispose = router.dispose;
	let decorated = 0;
	let published = 0;
	const stop = router.subscribe(() => published++);
	try {
		router.dispose = () => {
			decorated++;
			dispose();
		};
		await router.navigate('/second');
		expect(router.getSnapshot().location.pathname).toBe('/second');
		expect(published).toBeGreaterThan(0);
		stop();
		router.dispose();
		expect(decorated).toBe(1);
		const retired = published;
		source.push(new URL('http://exact.local/detached'));
		expect(published).toBe(retired);
	} finally {
		stop();
		dispose();
	}
	expect(counts).toEqual({ acquired: 1, released: 1 });
	const following = trackedRouter();
	try {
		await following.router.navigate('/following');
		expect(following.router.getSnapshot().location.pathname).toBe('/following');
	} finally {
		following.router.dispose();
	}
	expect(following.counts).toEqual({ acquired: 1, released: 1 });
});

it('keeps location observations writable without turning observation edits into navigation', async () => {
	const { router, counts } = trackedRouter();
	const state = { count: 1 };
	try {
		await router.navigate('/first', { state });
		const snapshot = router.getSnapshot();
		expect(router.getSnapshot()).toBe(snapshot);
		expect(snapshot.location.state).toBe(state);
		state.count = 2;
		expect(snapshot.location.state).toEqual({ count: 2 });
		const location = snapshot.location;
		location.state = { count: 3 };
		location.pathname = '/observation-only';
		expect(snapshot.location).toBe(location);
		expect(state.count).toBe(2);
		await router.navigate('/second');
		const next = router.getSnapshot();
		expect(next).not.toBe(snapshot);
		expect(next.location).not.toBe(location);
		expect(next.location.pathname).toBe('/second');
		expect(location.pathname).toBe('/observation-only');
	} finally {
		router.dispose();
	}
	expect(counts).toEqual({ acquired: 1, released: 1 });
});

it('keeps a submitted navigation location writable through publication and following work', async () => {
	const source = createMemoryLocationSource('/first');
	let complete!: (value: string) => void;
	const held = new Promise<string>((resolve) => {
		complete = resolve;
	});
	let actions = 0;
	const router = createExactRouter({
		source,
		routes: [
			{
				id: 'save',
				path: '/save',
				action: () => {
					actions++;
					return held;
				}
			}
		]
	});
	const published: string[] = [];
	const stop = router.subscribe(() => published.push(router.getSnapshot().navigation.state));
	const pending = router.submit('/save', { method: 'POST' });
	try {
		const navigation = router.getSnapshot().navigation;
		expect(navigation.state).toBe('submitting');
		expect(navigation.location?.pathname).toBe('/save');
		if (!navigation.location) throw new Error('Expected submitted location');
		navigation.location.state = { observed: true };
		expect(router.getSnapshot().navigation.location?.state).toEqual({ observed: true });
		complete('saved');
		await pending;
		expect(actions).toBe(1);
		expect(router.getSnapshot().actionData.save).toBe('saved');
		expect(published).toContain('submitting');
		expect(router.getSnapshot().navigation.state).toBe('idle');
		await router.navigate('/following');
		expect(router.getSnapshot().location.pathname).toBe('/following');
	} finally {
		complete('saved');
		await pending;
		stop();
		router.dispose();
	}
});
