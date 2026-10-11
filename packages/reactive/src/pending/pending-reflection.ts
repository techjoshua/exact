/** Captures the unpublished value or deletion of an owned property. */
export interface PendingPropertyValue {
	value: unknown;
	deleted?: boolean;
	/** A committed key was removed before this value was assigned again. */
	reinserted?: boolean;
}

/** Retains sparse Array length changes without allocating its committed storage. */
export interface PendingArrayState {
	length: number;
	cutoff: number;
}

/** Enumerates committed and pending own properties only when authored reflection requires it. */
export function pendingOwnKeys(
	target: object,
	cells?: Map<PropertyKey, PendingPropertyValue>,
	array?: PendingArrayState
): (string | symbol)[] {
	const keys = new Set(Reflect.ownKeys(target));
	if (array) for (const key of keys) if (index(key) >= array.cutoff) keys.delete(key);
	if (cells)
		for (const [key, cell] of cells) {
			const normalized = typeof key === 'number' ? String(key) : key;
			if (cell.deleted) keys.delete(normalized);
			else {
				if (cell.reinserted) keys.delete(normalized);
				keys.add(normalized);
			}
		}
	const numeric = [...keys].filter((key) => index(key) >= 0);
	numeric.sort((left, right) => index(left) - index(right));
	return [
		...numeric,
		...[...keys].filter((key) => typeof key === 'string' && index(key) < 0),
		...[...keys].filter((key) => typeof key === 'symbol')
	];
}

/** Exposes pending descriptor values while preserving native descriptor attributes. */
export function pendingDescriptor(
	target: object,
	key: PropertyKey,
	cells?: Map<PropertyKey, PendingPropertyValue>,
	array?: PendingArrayState
): PropertyDescriptor | undefined {
	const cell = cells?.get(key);
	if (cell?.deleted || (!cell && array && index(key) >= array.cutoff)) return undefined;
	const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
	if (array && key === 'length' && descriptor) return { ...descriptor, value: array.length };
	if (!cell) return descriptor;
	if (!descriptor)
		return { value: cell.value, enumerable: true, configurable: true, writable: true };
	return 'value' in descriptor ? { ...descriptor, value: cell.value } : descriptor;
}

function index(key: PropertyKey): number {
	if (typeof key !== 'string' || key === '') return -1;
	const value = Number(key);
	return Number.isInteger(value) && value >= 0 && value < 0xffff_ffff && String(value) === key
		? value
		: -1;
}

/** Finds an authored descriptor without evaluating getters or copying storage. */
export function pendingPropertyDescriptor(
	target: object,
	key: PropertyKey
): PropertyDescriptor | undefined {
	for (let owner: object | null = target; owner; owner = Reflect.getPrototypeOf(owner)) {
		const descriptor = Reflect.getOwnPropertyDescriptor(owner, key);
		if (descriptor) return descriptor;
	}
	return undefined;
}
