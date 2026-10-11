/** Provides the canonical void elements value. */
export const voidElements = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

// Non-global guards retain no matching cursor between calls. Native string replacement resets
// its global matcher, and the replacement callback cannot re-enter authored serialization.
const textNeedsEscaping = /[&<>]/;
const textEscapes = /[&<>]/g;
const attributeNeedsEscaping = /[&<>"]/;
const attributeEscapes = /[&<>"]/g;
const validAttributeName = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;

/** Escapes text content for safe HTML output. */
export function escapeText(value: string): string {
	return textNeedsEscaping.test(value) ? value.replace(textEscapes, escapeHtmlCharacter) : value;
}

/** Escapes an attribute value for safe HTML output. */
export function escapeAttr(value: string): string {
	return attributeNeedsEscaping.test(value)
		? value.replace(attributeEscapes, escapeHtmlCharacter)
		: value;
}

/** Returns a safe attribute name or a harmless placeholder when the name is invalid. */
export function escapeAttrName(value: string): string {
	return validAttributeName.test(value) ? value : 'data-exact-invalid-attr';
}

function escapeHtmlCharacter(character: string): string {
	if (character === '&') return '&amp;';
	if (character === '<') return '&lt;';
	if (character === '>') return '&gt;';
	return '&quot;';
}
