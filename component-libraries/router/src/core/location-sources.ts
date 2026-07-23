import type { HistoryAction, LocationSource, RouterMode } from './contracts.js';
import { createKey, toUrl } from './locations.js';

/** Creates an in-memory history source with deterministic entry ownership. */
export function createMemoryLocationSource(
	initial: string | URL | readonly (string | URL)[] = 'http://exact.local/',
	initialIndex?: number
): LocationSource & { entries: readonly URL[]; index(): number } {
	const initialEntries = Array.isArray(initial) ? initial : [initial];
	if (!initialEntries.length) throw new Error('Memory location source requires at least one entry');
	const entries: URL[] = initialEntries.map((value) => toUrl(value));
	let index = initialIndex ?? entries.length - 1;
	if (index < 0 || index >= entries.length)
		throw new RangeError('Memory location source initialIndex is outside its entries');
	let action: HistoryAction = 'POP';
	const states: unknown[] = entries.map(() => undefined);
	const keys = entries.map(() => createKey());
	const listeners = new Set<(action?: HistoryAction) => void>();
	const notify = () => listeners.forEach((listener) => listener(action));
	return {
		get entries() {
			return entries;
		},
		index: () => index,
		location: () => entries[index]!,
		state: () => states[index],
		key: () => keys[index]!,
		action: () => action,
		push(url, state) {
			action = 'PUSH';
			entries.splice(++index, entries.length, url);
			states.splice(index, states.length, state);
			keys.splice(index, keys.length, createKey());
			notify();
		},
		replace(url, state) {
			action = 'REPLACE';
			entries[index] = url;
			states[index] = state;
			keys[index] = createKey();
			notify();
		},
		go(delta) {
			const next = Math.min(entries.length - 1, Math.max(0, index + delta));
			if (next === index) return;
			action = 'POP';
			index = next;
			notify();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}

/** Creates a browser-backed history or hash location source when a window exists. */
export function createBrowserLocationSource(
	mode: RouterMode = 'history'
): LocationSource | undefined {
	if (typeof window === 'undefined') return undefined;
	const opaqueOrigin = window.location.origin === 'null';
	const routeOrigin = opaqueOrigin ? 'http://exact.local' : window.location.origin;
	const read = () =>
		mode === 'hash'
			? new URL(window.location.hash.slice(1) || '/', routeOrigin)
			: new URL(window.location.href);
	return {
		location: read,
		state: () => window.history.state?.usr,
		key: () => String(window.history.state?.key ?? 'default'),
		push(url, state) {
			const next = { usr: state, key: createKey() };
			if (mode === 'hash') {
				const hash = `#${url.pathname}${url.search}${url.hash}`;
				if (opaqueOrigin) window.location.hash = hash;
				else window.history.pushState(next, '', hash);
			} else window.history.pushState(next, '', url);
		},
		replace(url, state) {
			const next = { usr: state, key: createKey() };
			if (mode === 'hash') {
				const hash = `#${url.pathname}${url.search}${url.hash}`;
				if (opaqueOrigin) window.location.replace(hash);
				else window.history.replaceState(next, '', hash);
			} else window.history.replaceState(next, '', url);
		},
		go(delta) {
			window.history.go(delta);
		},
		subscribe(listener) {
			const type = mode === 'hash' ? 'hashchange' : 'popstate';
			const handle = () => listener('POP');
			window.addEventListener(type, handle);
			return () => window.removeEventListener(type, handle);
		}
	};
}
