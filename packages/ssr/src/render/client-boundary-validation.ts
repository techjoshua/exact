/** Describes a non-serializable value found in one compiler-owned client boundary payload. */
export function clientBoundarySerializationMessage(
	name: string,
	id: string,
	unsafePath: string
): string {
	const label = name || id;
	const location = name && id ? `${label} (${id})` : label;
	const generatedBucket = clientBoundaryGeneratedBucket(unsafePath);
	const generatedHint = generatedBucket ? ` in generated ${generatedBucket} payload` : '';
	return `Client boundary ${location} props must be JSON-serializable; non-serializable value at ${unsafePath}${generatedHint}`;
}

/** Identifies which generated boundary payload bucket owns a rejected value. */
export function clientBoundaryGeneratedBucket(path: string): string | undefined {
	const match = /^\$\.(__exact[A-Za-z0-9_$]*)(?:\.|\[|$)/.exec(path);
	return match?.[1];
}
