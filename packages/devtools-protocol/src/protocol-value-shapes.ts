/** Accepts nonempty protocol identifiers and labels within their field-specific character limit. */
export function boundedString(value: unknown, maximum: number): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

/** Narrows plain own-data records without running getters. Failed meta-object inspection is rejected. */
export function record(value: unknown): value is Record<string, unknown> {
	try {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) return false;
		for (const key of Object.getOwnPropertyNames(value)) {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor || !('value' in descriptor)) return false;
		}
		return true;
	} catch {
		return false;
	}
}

/** Validates configured inspection budgets as safe integer counts with a field-specific minimum. */
export function inspectionLimit(value: number, minimum: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < minimum)
		throw new RangeError(`Invalid eXact inspection ${label}`);
	return value;
}
