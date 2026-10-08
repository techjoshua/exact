import { renderHydrationScript } from '@exactjs/ssr';
import { registerReactiveListKey } from '@exactjs/reactive';

/** Checks hydration's authored-data boundary using native runtime property and JSON semantics. */
export function serializationSafety() {
	let calls = 0;
	const hook = () => {
		calls++;
		return { invalid: Infinity };
	};
	const keyed = [{ id: 'safe' }];
	registerReactiveListKey(keyed, (item) => item.id, 'acceptance', 'member:id');
	Object.defineProperty(keyed, Symbol.iterator, { get: hook });
	const invalid = [
		Object.defineProperty({ value: 'safe' }, 'toJSON', { value: hook }),
		Object.defineProperty(['safe'], 'toJSON', { get: hook }),
		Object.defineProperty(['safe'], '0', { get: hook, enumerable: false }),
		Object.defineProperty(['safe'], '0', { value: Infinity, enumerable: false }),
		keyed,
		Object.defineProperty(new Map([['safe', 1]]), Symbol.iterator, { get: hook }),
		Object.defineProperty(new Set([1]), Symbol.iterator, { get: hook })
	];
	const rejected = invalid.map((value) => {
		try {
			renderHydrationScript({ state: { value } });
			return false;
		} catch (error) {
			return /JSON-serializable/.test(error.message);
		}
	});
	const valid = [
		{ toJSON: 'data', value: 'safe' },
		new Array(3),
		Object.defineProperty(['safe'], '0', { value: 'hidden', enumerable: false })
	];
	const scripts = valid.map((value) => ({
		value: JSON.parse(JSON.stringify(value)),
		script: renderHydrationScript({ state: { value } })
	}));
	return { rejected, calls, scripts };
}
