import { unwrap } from '@exactjs/reactive';
import { hasOwn } from './attribute-traversal.js';

/** Serializes an owned native or React-compatible style value. */
export function renderStyle(value: unknown, reactMarkup: boolean): string {
	const actual = unwrap(value);
	if (!actual || actual === false) return '';
	if (typeof actual === 'string') return actual;
	if (typeof actual !== 'object') return '';
	let style = '';
	for (const name in actual) {
		if (!hasOwn(actual, name)) continue;
		const raw = (actual as Record<string, unknown>)[name];
		const styleValue = unwrap(raw);
		if (styleValue === null || styleValue === undefined || styleValue === false) continue;
		const serialized =
			reactMarkup &&
			typeof styleValue === 'number' &&
			styleValue !== 0 &&
			!reactUnitlessStyles.has(name)
				? `${styleValue}px`
				: String(styleValue);
		if (style) style += reactMarkup ? ';' : ' ';
		style += reactMarkup
			? `${toCssProperty(name)}:${serialized}`
			: `${toCssProperty(name)}: ${serialized};`;
	}
	return style;
}

function toCssProperty(name: string): string {
	if (name.startsWith('--')) return name;
	let converted = '';
	for (let index = 0; index < name.length; index++) {
		const code = name.charCodeAt(index);
		converted += code >= 65 && code <= 90 ? `-${String.fromCharCode(code + 32)}` : name[index]!;
	}
	return name.startsWith('ms') ? `-${converted}` : converted;
}

const unitlessNames = [
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
];
const reactUnitlessStyles = new Set(unitlessNames);
for (const prefix of ['Webkit', 'Moz', 'ms', 'O']) {
	for (const name of unitlessNames)
		reactUnitlessStyles.add(`${prefix}${name[0]!.toUpperCase()}${name.slice(1)}`);
}
