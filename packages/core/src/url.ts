const javascriptProtocol =
	/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;

const urlAttributes = new Set(['action', 'formaction', 'href', 'src', 'xlink:href', 'xlinkhref']);

export const BLOCKED_JAVASCRIPT_URL =
	"javascript:throw new Error('eXact has blocked a javascript: URL as a security precaution.')";

export function isUrlAttribute(name: string): boolean {
	return urlAttributes.has(name.toLowerCase());
}

/** Applies the native eXact URL policy to one JSX/DOM attribute value. */
export function sanitizeUrlAttribute(name: string, value: unknown): unknown {
	if (!isUrlAttribute(name) || value === null || value === undefined) return value;
	const text = String(value);
	return javascriptProtocol.test(text) ? BLOCKED_JAVASCRIPT_URL : value;
}
