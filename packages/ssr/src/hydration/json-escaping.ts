const host = globalThis as {
	Bun?: unknown;
	Deno?: unknown;
	process?: { versions?: { node?: string } };
};

// Node's slice assembly reduces intermediate replacement strings. Bun's native
// replacements handle dense escapes substantially faster, so other hosts retain them.
const escapeSerializedJson =
	typeof host.Bun === 'undefined' &&
	typeof host.Deno === 'undefined' &&
	typeof host.process?.versions?.node === 'string'
		? escapeJsonWithSlices
		: escapeJsonWithNativeReplacement;

/** Serializes JSON for an inert HTML script, escaping values and property names without changing them. */
export function serializeHydrationJson(
	payload: unknown,
	replacer?: (this: unknown, key: string, value: unknown) => unknown
): string {
	return escapeSerializedJson(JSON.stringify(payload, replacer));
}

/** Retains native replacement on hosts without a measured advantage from slice assembly. */
function escapeJsonWithNativeReplacement(value: string): string {
	return value
		.replace(/</g, '\\u003C')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
}

/** Merges three ordered searches, appending untouched spans without searching the growing result. */
function escapeJsonWithSlices(value: string): string {
	let less = value.indexOf('<');
	let line = value.indexOf('\u2028');
	let paragraph = value.indexOf('\u2029');
	if (less < 0 && line < 0 && paragraph < 0) return value;
	let output = '';
	let from = 0;
	while (less >= 0 || line >= 0 || paragraph >= 0) {
		const position = Math.min(
			less < 0 ? Infinity : less,
			line < 0 ? Infinity : line,
			paragraph < 0 ? Infinity : paragraph
		);
		const replacement = position === less ? '\\u003C' : position === line ? '\\u2028' : '\\u2029';
		output += value.slice(from, position) + replacement;
		from = position + 1;
		if (position === less) less = value.indexOf('<', from);
		else if (position === line) line = value.indexOf('\u2028', from);
		else paragraph = value.indexOf('\u2029', from);
	}
	return output + value.slice(from);
}
