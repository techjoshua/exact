/**
 * Copies plain theme data into ordinary writable observations without sharing cached graphs.
 * Preserves shared children, array holes, and null prototypes. Iteration also handles deep
 * source snapshots without consuming the JavaScript call stack. Other class instances retain
 * identity and are not eligible for shared palette caching.
 */
export function copyThemeData<T>(value: T): T {
	if (!value || typeof value !== 'object') return value;
	const copies = new Map<object, object>();
	const pending: object[] = [];
	const copy = (source: object): object => {
		const prototype = Object.getPrototypeOf(source);
		if (!Array.isArray(source) && prototype !== Object.prototype && prototype !== null)
			return source;
		let target = copies.get(source);
		if (target) return target;
		target = Array.isArray(source)
			? new Array(source.length)
			: Object.create(Object.getPrototypeOf(source));
		copies.set(source, target!);
		pending.push(source);
		return target!;
	};
	const result = copy(value);
	for (let index = 0; index < pending.length; index++) {
		const source = pending[index]!;
		const target = copies.get(source)!;
		for (const [key, child] of Object.entries(source)) {
			const value = child && typeof child === 'object' ? copy(child) : child;
			if (key !== '__proto__') (target as Record<string, unknown>)[key] = value;
			else
				Object.defineProperty(target, key, {
					value,
					writable: true,
					configurable: true,
					enumerable: true
				});
		}
	}
	return result as T;
}
