const javascriptProtocol =
	/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;

const urlAttributes = new Set(['action', 'formaction', 'href', 'src', 'xlink:href', 'xlinkhref']);

/** Provides the canonical blocked javascript url value. */
export const BLOCKED_JAVASCRIPT_URL =
	"javascript:throw new Error('eXact has blocked a javascript: URL as a security precaution.')";

/** Reports whether url attribute. */
export function isUrlAttribute(name: string): boolean {
	return urlAttributes.has(name.toLowerCase());
}

/**
 * Blocks javascript protocols in native URL attributes, including whitespace-obfuscated forms.
 * Stringable objects and functions are converted once so publication uses the checked text.
 * Other attributes and safe primitive values retain their original representation.
 */
export function sanitizeUrlAttribute(name: string, value: unknown): unknown {
	if (!isUrlAttribute(name) || value === null || value === undefined) return value;
	const text = String(value);
	if (javascriptProtocol.test(text)) return BLOCKED_JAVASCRIPT_URL;
	return typeof value === 'object' || typeof value === 'function' ? text : value;
}
