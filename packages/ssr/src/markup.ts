import { decodeExactMarkerPart, encodeExactMarkerPart, sanitizeUrlAttribute } from '@exactjs/core';
import { unwrap } from '@exactjs/reactive';
import { escapeAttr, escapeAttrName } from './html.js';
import type { SsrContext } from './types.js';

/** Renders vnode props into escaped HTML attributes, skipping event and framework-only props. */
export function renderAttrs(
	props: Record<string, unknown>,
	reactMarkup: boolean | 18 | 19 = false,
	tag?: string
): string {
	let attrs = '';
	const customElement = !!reactMarkup && !!tag?.includes('-');
	for (const [name, rawValue] of reactMarkup
		? reactOrderedProps(props, tag, reactMarkup)
		: Object.entries(props)) {
		if (!reactMarkup && name === 'dangerouslySetInnerHTML') {
			throw new Error(
				'Native eXact does not support dangerouslySetInnerHTML; use unsafeHtml() with explicit root opt-in.'
			);
		}
		if (
			name === 'children' ||
			name === 'key' ||
			name === 'ref' ||
			name === '__exactBindInput' ||
			name === '__exactBindChange' ||
			name === 'dangerouslySetInnerHTML' ||
			/^on[A-Z]/.test(name)
		)
			continue;
		if (
			reactMarkup &&
			(tag === 'textarea' || tag === 'select') &&
			(name === 'value' || name === 'defaultValue')
		)
			continue;
		if (reactMarkup && tag === 'option' && name === 'children') continue;
		const unwrapped = unwrap(rawValue);
		const normalized =
			name === 'value' && tag === 'input' && props.type === 'date' && unwrapped instanceof Date
				? Number.isNaN(unwrapped.getTime())
					? ''
					: unwrapped.toISOString().slice(0, 10)
				: unwrapped;
		const value = sanitizeUrlAttribute(name, normalized);
		const attrName = reactMarkup
			? reactAttributeName(name, reactMarkup, customElement)
			: nativeAttributeName(name, tag);
		if (value === null || value === undefined) continue;
		if (value === false && (!reactMarkup || reactBooleanAttributes.has(attrName.toLowerCase())))
			continue;
		if (attrName === 'style') {
			const style = renderStyle(value, !!reactMarkup);
			if (style) attrs += ` style="${escapeAttr(style)}"`;
			continue;
		}
		if (value === true) {
			attrs += reactMarkup
				? reactBooleanAttributes.has(attrName.toLowerCase()) ||
					(reactMarkup === 19 && customElement)
					? ` ${escapeAttrName(attrName)}=""`
					: ` ${escapeAttrName(attrName)}="true"`
				: ` ${escapeAttrName(attrName)}`;
			continue;
		}
		attrs += ` ${escapeAttrName(attrName)}="${escapeAttr(String(value))}"`;
	}
	return attrs;
}

function nativeAttributeName(name: string, tag: string | undefined): string {
	if (name === 'className') return 'class';
	if (tag !== 'script') return name;
	switch (name) {
		case 'crossOrigin':
			return 'crossorigin';
		case 'fetchPriority':
			return 'fetchpriority';
		case 'noModule':
			return 'nomodule';
		case 'referrerPolicy':
			return 'referrerpolicy';
		default:
			return name;
	}
}

/** Renders content inside a generated exact marker pair. */
export function withMarker(
	context: SsrContext,
	kind: string,
	key: string | undefined,
	render: () => string
): string {
	return markerPair(context, markerId(context, kind, undefined, key), render);
}

/** Renders a stable exact marker pair around sync or async HTML content. */
export function markerPair(context: SsrContext, id: string, render: () => string): string;
export function markerPair(
	context: SsrContext,
	id: string,
	render: () => Promise<string>
): Promise<string>;
export function markerPair(
	context: SsrContext,
	id: string,
	render: () => string | Promise<string>
): string | Promise<string> {
	if (!context.markers) return render();
	const rendered = render();
	if (rendered instanceof Promise) {
		return rendered.then((html) => `<!--exact:${id}-->${html}<!--/exact:${id}-->`);
	}
	return `<!--exact:${id}-->${rendered}<!--/exact:${id}-->`;
}

/** Allocates a marker id from render context, kind, optional name, and optional key. */
export function markerId(context: SsrContext, kind: string, name?: string, key?: string): string {
	return `${kind}:${context.nextId++}${name ? `:${encodeExactMarkerPart(name)}` : ''}${key ? `:${encodeExactMarkerPart(key)}` : ''}`;
}

/** Normalizes a compiler-provided exact marker id by removing a leading exact prefix. */
export function exactMarkerId(id: string): string {
	return id.startsWith('exact:') ? id.slice('exact:'.length) : id;
}

/** Creates the marker id used for one keyed list item. */
export function keyedItemMarkerId(key: string): string {
	return `item:${encodeExactMarkerPart(key)}`;
}

/** Encodes arbitrary UTF-8 marker data without lossy HTML-comment sanitizing. */
export function encodeMarkerKey(value: string): string {
	return encodeExactMarkerPart(value);
}

/** Decodes marker data emitted by encodeMarkerKey; legacy safe keys pass through. */
export function decodeMarkerKey(value: string): string {
	return decodeExactMarkerPart(value);
}

function renderStyle(value: unknown, reactMarkup: boolean): string {
	const actual = unwrap(value);
	if (!actual || actual === false) return '';
	if (typeof actual === 'string') return actual;
	if (typeof actual !== 'object') return '';
	const chunks: string[] = [];
	for (const [name, raw] of Object.entries(actual)) {
		const styleValue = unwrap(raw);
		if (styleValue === null || styleValue === undefined || styleValue === false) continue;
		const serialized =
			reactMarkup &&
			typeof styleValue === 'number' &&
			styleValue !== 0 &&
			!reactUnitlessStyles.has(name)
				? `${styleValue}px`
				: String(styleValue);
		chunks.push(
			reactMarkup
				? `${toCssProperty(name)}:${serialized}`
				: `${toCssProperty(name)}: ${serialized};`
		);
	}
	return reactMarkup ? chunks.join(';') : chunks.join(' ');
}

function toCssProperty(name: string): string {
	if (name.startsWith('--')) return name;
	const converted = name.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
	return name.startsWith('ms') ? `-${converted}` : converted;
}

const reactAttributeNames: Record<string, string> = {
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

const reactBooleanAttributes = new Set([
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

function reactAttributeName(
	name: string,
	version: boolean | 18 | 19,
	customElement: boolean
): string {
	if (name.startsWith('data-') || name.startsWith('aria-') || name.startsWith('--')) return name;
	if (customElement) return version === 19 && name === 'className' ? 'class' : name;
	if (version === 19 && (name === 'spellCheck' || name === 'contentEditable')) return name;
	if (version === 19 && name === 'readOnly') return name;
	return reactAttributeNames[name] ?? name.toLowerCase();
}

const reactUnitlessStyles = new Set([
	'animationIterationCount',
	'aspectRatio',
	'borderImageOutset',
	'borderImageSlice',
	'borderImageWidth',
	'boxFlex',
	'boxFlexGroup',
	'boxOrdinalGroup',
	'columnCount',
	'columns',
	'flex',
	'flexGrow',
	'flexPositive',
	'flexShrink',
	'flexNegative',
	'flexOrder',
	'gridArea',
	'gridColumn',
	'gridColumnEnd',
	'gridColumnSpan',
	'gridColumnStart',
	'gridRow',
	'gridRowEnd',
	'gridRowSpan',
	'gridRowStart',
	'fontWeight',
	'lineClamp',
	'lineHeight',
	'opacity',
	'order',
	'orphans',
	'scale',
	'tabSize',
	'widows',
	'zIndex',
	'zoom',
	'fillOpacity',
	'floodOpacity',
	'stopOpacity',
	'strokeDasharray',
	'strokeDashoffset',
	'strokeMiterlimit',
	'strokeOpacity',
	'strokeWidth'
]);

for (const prefix of ['Webkit', 'Moz', 'ms', 'O']) {
	for (const name of [...reactUnitlessStyles])
		reactUnitlessStyles.add(`${prefix}${name[0]!.toUpperCase()}${name.slice(1)}`);
}

function reactOrderedProps(
	props: Record<string, unknown>,
	tag: string | undefined,
	version: boolean | 18 | 19
): Array<[string, unknown]> {
	const entries = Object.entries(props);
	if (tag === 'input') {
		const ordered = deferProps(entries, ['checked', 'defaultChecked', 'value', 'defaultValue']);
		return version === 19 ? prioritizeProps(ordered, ['type', 'disabled', 'name']) : ordered;
	}
	if (tag === 'option') return deferProps(entries, ['value', 'selected']);
	return entries;
}

function prioritizeProps(
	entries: Array<[string, unknown]>,
	names: readonly string[]
): Array<[string, unknown]> {
	const prioritized = new Set(names);
	return [
		...names.flatMap((name) => entries.filter(([entry]) => entry === name)),
		...entries.filter(([name]) => !prioritized.has(name))
	];
}

function deferProps(
	entries: Array<[string, unknown]>,
	names: readonly string[]
): Array<[string, unknown]> {
	const deferred = new Set(names);
	return [
		...entries.filter(([name]) => !deferred.has(name)),
		...names.flatMap((name) => entries.filter(([entry]) => entry === name))
	];
}
