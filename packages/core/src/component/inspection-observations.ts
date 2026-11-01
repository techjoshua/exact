/** Copies bounded data-only inspection trees without sharing retained records or strengthening readonly. */
export function copyInspectionObservation<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		const result: unknown[] = [];
		for (let index = 0; index < value.length; index++)
			result.push(copyInspectionObservation(value[index]));
		return result as T;
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, copyInspectionObservation(entry)])
	) as T;
}
