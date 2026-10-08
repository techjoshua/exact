const lessThan = /</g;

/**
 * Serializes JSON for an inert HTML script, preserving decoded values and property names.
 * Escaping `<` prevents closing tags and legacy script-comment states. JSON without `<`
 * needs no substitution, including strings containing ordinary U+2028 and U+2029 characters.
 */
export function serializeHydrationJson(
	payload: unknown,
	replacer?: (this: unknown, key: string, value: unknown) => unknown
): string {
	const json = JSON.stringify(payload, replacer);
	return json.indexOf('<') < 0 ? json : json.replace(lessThan, '\\u003C');
}
