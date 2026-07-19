/** Escapes a value for use inside a DOM selector, falling back when CSS.escape is unavailable. */
export function cssEscape(value: string): string {
	return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
		? CSS.escape(value)
		: value.replace(/["\\]/g, '\\$&');
}
