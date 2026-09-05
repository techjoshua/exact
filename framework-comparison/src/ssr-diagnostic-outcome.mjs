/** Captures an attribution-only failure without manufacturing a timing population. */
export async function captureSsrDiagnostic(work) {
	try {
		return { supported: true, value: await work() };
	} catch (error) {
		return { supported: false, reason: diagnosticErrorMessage(error) };
	}
}

function diagnosticErrorMessage(error) {
	const messages = [];
	let cursor = error;
	while (cursor && typeof cursor === 'object') {
		const message = cursor instanceof Error ? cursor.message : String(cursor);
		if (message && messages.at(-1) !== message) messages.push(message);
		cursor = cursor.cause;
	}
	return messages.join(': ') || 'Unknown SSR diagnostic failure';
}
