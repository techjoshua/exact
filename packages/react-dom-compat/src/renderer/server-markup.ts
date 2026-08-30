import type { ReactNode } from '@exactjs/react-compat';
import { isReactElement, reactCompatibilityTarget } from '@exactjs/react-compat/exact';

/** HTML void elements emitted without closing tags by React SSR. */
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

const unitlessStyles = new Set([
	'animationIterationCount',
	'flex',
	'flexGrow',
	'flexShrink',
	'fontWeight',
	'lineHeight',
	'opacity',
	'order',
	'orphans',
	'scale',
	'widows',
	'zIndex',
	'zoom'
]);

const booleanAttributes = new Set([
	'allowFullScreen',
	'async',
	'autoFocus',
	'autoPlay',
	'checked',
	'controls',
	'default',
	'defer',
	'disabled',
	'hidden',
	'loop',
	'multiple',
	'muted',
	'noModule',
	'open',
	'playsInline',
	'readOnly',
	'required',
	'reversed',
	'selected'
]);

/** Serializes React host props using React-compatible HTML names and value rules. */
export function renderAttributes(props: Record<string, unknown>, tag?: string): string {
	let result = '';
	const entries = Object.entries(props);
	if (tag === 'input') {
		entries.sort(([left], [right]) =>
			reactCompatibilityTarget() === 19 && left === 'disabled' && right !== 'disabled'
				? -1
				: reactCompatibilityTarget() === 19 && right === 'disabled' && left !== 'disabled'
					? 1
					: left === 'readOnly' && right === 'value'
						? -1
						: left === 'value' && right === 'readOnly'
							? 1
							: 0
		);
	}
	for (const [authored, value] of entries) {
		if (
			authored === 'children' ||
			authored === 'dangerouslySetInnerHTML' ||
			authored === 'ref' ||
			/^on[A-Z]/.test(authored) ||
			value === undefined ||
			value === null ||
			(value === false && booleanAttributes.has(authored)) ||
			typeof value === 'function'
		)
			continue;
		const name = reactAttributeName(authored);
		if (authored === 'style' && typeof value === 'object') {
			const style = Object.entries(value as Record<string, unknown>)
				.map(([key, entry]) => `${cssName(key)}:${cssValue(key, entry)}`)
				.join(';');
			if (style) result += ` style="${escapeAttribute(style)}"`;
		} else if (value === true) {
			const serialized = tag?.includes('-') && reactCompatibilityTarget() === 18 ? 'true' : '';
			result += ` ${name}="${serialized}"`;
		} else result += ` ${name}="${escapeAttribute(String(value))}"`;
	}
	return result;
}

/** Maps React's authored DOM prop names to their serialized attribute identities. */
export function reactAttributeName(name: string): string {
	if (name === 'className') return 'class';
	if (name === 'htmlFor') return 'for';
	if (name === 'tabIndex') return 'tabindex';
	if (name === 'spellCheck') return reactCompatibilityTarget() === 18 ? 'spellcheck' : 'spellCheck';
	if (name === 'strokeWidth') return 'stroke-width';
	if (name === 'xlinkHref') return 'xlink:href';
	return name;
}

/** Reads an explicitly authored React raw-HTML payload. */
export function dangerousHtml(props: Record<string, unknown>): string | undefined {
	const value = props.dangerouslySetInnerHTML;
	return typeof value === 'object' && value !== null && '__html' in value
		? String((value as { __html: unknown }).__html ?? '')
		: undefined;
}

function cssName(name: string): string {
	if (name.startsWith('--')) return name;
	const converted = name.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`);
	return name.startsWith('ms') ? `-${converted}` : converted;
}

function cssValue(name: string, value: unknown): string {
	return typeof value === 'number' &&
		value !== 0 &&
		!unitlessStyles.has(name) &&
		!name.endsWith('LineClamp')
		? `${value}px`
		: String(value);
}

/** Copies host props while omitting renderer-consumed values. */
export function withoutProps(
	props: Record<string, unknown>,
	...names: readonly string[]
): Record<string, unknown> {
	const result = { ...props };
	for (const name of names) delete result[name];
	return result;
}

/** Marks the matching React option selected for a controlled select host. */
export function selectChildren(children: ReactNode, selected: unknown): ReactNode {
	if (selected === undefined || selected === null) return children;
	if (Array.isArray(children)) return children.map((child) => selectChildren(child, selected));
	if (!isReactElement(children) || children.type !== 'option') return children;
	const props = children.props as Record<string, unknown>;
	return { ...children, props: { ...props, selected: String(props.value) === String(selected) } };
}

/** Records the implicit React image preload resource. */
export function recordImagePreload(
	context: { resources: Map<string, { priority: number; html: string }> },
	tag: string,
	props: Record<string, unknown>
): void {
	if (
		reactCompatibilityTarget() !== 19 ||
		tag !== 'img' ||
		typeof props.src !== 'string' ||
		!props.src
	)
		return;
	const href = escapeAttribute(props.src);
	context.resources.set(`image:${props.src}`, {
		priority: 25,
		html: `<link rel="preload" as="image" href="${href}"/>`
	});
}

/** Escapes HTML text content. */
export function escapeText(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escapes one HTML attribute value. */
export function escapeAttribute(value: string): string {
	return escapeText(value).replace(/"/g, '&quot;');
}

/** Reports whether a React value serializes as scalar text. */
export function isTextNode(value: ReactNode): boolean {
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint';
}
