/** Identifies event-shaped native props regardless of authored casing. */
export function isNativeEventProp(name: string): boolean {
	return (
		name.length > 2 && (name[0] === 'o' || name[0] === 'O') && (name[1] === 'n' || name[1] === 'N')
	);
}

/** Rejects HTML-writing properties that bypass receipt validation and renderer range ownership. */
export function assertNativePropAllowed(name: string): void {
	const first = name[0];
	if (
		first !== 'i' &&
		first !== 'I' &&
		first !== 'o' &&
		first !== 'O' &&
		first !== 'd' &&
		first !== 'D'
	)
		return;
	const lower = name.toLowerCase();
	if (lower === 'innerhtml' || lower === 'outerhtml' || lower === 'dangerouslysetinnerhtml') {
		throw new TypeError(
			`Native eXact does not support ${name}; use unsafeHtml() with explicit root opt-in.`
		);
	}
}

/** Rejects inline code and non-callable event values before DOM mutation or HTML serialization. */
export function assertNativeEventHandler(value: unknown): void {
	if (value != null && value !== false && typeof value !== 'function') {
		throw new TypeError(
			'Native eXact event handlers must be functions; inline event strings are not supported.'
		);
	}
}

/** Canonicalizes the HTML document attribute before checking its unsafeHtml capability. */
export function isNativeSrcdocProp(name: string): boolean {
	return name.length === 6 && name.toLowerCase() === 'srcdoc';
}
