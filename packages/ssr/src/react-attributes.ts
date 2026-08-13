const names: Record<string, string> = {
	acceptCharset: 'accept-charset',
	autoCapitalize: 'autoCapitalize',
	autoComplete: 'autoComplete',
	className: 'class',
	htmlFor: 'for',
	httpEquiv: 'http-equiv',
	charSet: 'charset',
	crossOrigin: 'crossorigin',
	defaultChecked: 'checked',
	defaultValue: 'value',
	fetchPriority: 'fetchpriority',
	formAction: 'formaction',
	formEncType: 'formenctype',
	formMethod: 'formmethod',
	formNoValidate: 'formnovalidate',
	formTarget: 'formtarget',
	referrerPolicy: 'referrerpolicy',
	srcSet: 'srcset',
	useMap: 'usemap',
	viewBox: 'viewBox',
	preserveAspectRatio: 'preserveAspectRatio',
	xlinkHref: 'xlink:href',
	xmlLang: 'xml:lang',
	strokeWidth: 'stroke-width',
	strokeLinecap: 'stroke-linecap',
	strokeLinejoin: 'stroke-linejoin',
	strokeMiterlimit: 'stroke-miterlimit',
	strokeDasharray: 'stroke-dasharray',
	strokeDashoffset: 'stroke-dashoffset',
	fillRule: 'fill-rule',
	clipPath: 'clip-path',
	clipRule: 'clip-rule'
};

/** React boolean attributes whose false value is omitted and true value is empty. */
export const reactBooleanAttributes = new Set([
	'allowfullscreen',
	'async',
	'autofocus',
	'autoplay',
	'checked',
	'controls',
	'default',
	'defer',
	'disabled',
	'download',
	'formnovalidate',
	'hidden',
	'inert',
	'ismap',
	'itemscope',
	'loop',
	'multiple',
	'muted',
	'nomodule',
	'novalidate',
	'open',
	'playsinline',
	'readonly',
	'required',
	'reversed',
	'scoped',
	'seamless',
	'selected'
]);

/** Resolves the React-compatible serialized name for one JSX property. */
export function reactAttributeName(
	name: string,
	version: boolean | 18 | 19,
	customElement: boolean
): string {
	if (name.startsWith('data-') || name.startsWith('aria-') || name.startsWith('--')) return name;
	if (customElement) return version === 19 && name === 'className' ? 'class' : name;
	if (version === 19 && (name === 'spellCheck' || name === 'contentEditable')) return name;
	if (version === 19 && name === 'readOnly') return name;
	return names[name] ?? name.toLowerCase();
}
