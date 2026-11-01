/** Returns a routing dictionary's own value, excluding inherited names when no value was published. */
export function routeRecordValue<T>(
	record: Readonly<Record<string, T>>,
	key: string
): T | undefined {
	return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** Writes a routing dictionary key without invoking the standard prototype setter. */
export function setRouteRecordValue<T>(record: Record<string, T>, key: string, value: T): void {
	if (key === '__proto__')
		Object.defineProperty(record, key, {
			value,
			enumerable: true,
			configurable: true,
			writable: true
		});
	else record[key] = value;
}
