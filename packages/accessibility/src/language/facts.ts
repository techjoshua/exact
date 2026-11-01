import type {
	ExactEnhancementActivationV1,
	ExactJsxAttributeV1,
	ExactJsxLanguageFactV1,
	ExactLanguageDiagnosticV1
} from '@exactjs/language-extension-api';
import { ariaDataSource } from '../generated/aria-data.js';

/** Maps accepted JSX relationship spellings to the actual ARIA attribute described by hover. */
export const accessibilityRelationshipAttributes: Readonly<Record<string, string>> = {
	'active-descendant': 'aria-activedescendant',
	controls: 'aria-controls',
	'described-by': 'aria-describedby',
	details: 'aria-details',
	'error-message': 'aria-errormessage',
	'flow-to': 'aria-flowto',
	'labelled-by': 'aria-labelledby',
	owns: 'aria-owns'
};

/** Accepted JSX names shared by package completion and source-fact consumers. */
export const accessibilityActivators = [
	...Object.keys(accessibilityRelationshipAttributes),
	'focus-scope',
	'initial-focus',
	'navigate',
	'return-focus'
] as const;

/** Runtime roles for which the package publishes a complete navigation policy. */
export const supportedNavigationRoles = new Set([
	'tablist',
	'listbox',
	'radiogroup',
	'toolbar',
	'grid'
]);

/** Indexes authored and local attribute names for one projected JSX element. */
export function attributeMap(
	element: ExactJsxLanguageFactV1
): ReadonlyMap<string, ExactJsxAttributeV1> {
	return new Map(
		element.attributes.flatMap((attribute) => [
			[attribute.name, attribute],
			[attribute.localName, attribute]
		])
	);
}

/** Returns the final explicit ID candidate, discarding evidence overwritten by a spread. */
export function effectiveIdAttribute(
	element: ExactJsxLanguageFactV1
): ExactJsxAttributeV1 | undefined {
	let candidate: ExactJsxAttributeV1 | undefined;
	for (const attribute of element.attributes) {
		if (attribute.valueKind === 'spread') candidate = undefined;
		else if (attribute.name === 'id' || attribute.localName === 'id') candidate = attribute;
	}
	return candidate;
}

/** Returns a compiler-proven string constant. */
export function staticString(attribute: ExactJsxAttributeV1 | undefined): string | undefined {
	return typeof attribute?.constant === 'string' ? attribute.constant : undefined;
}

/** Returns a compiler-proven finite number. */
export function staticNumber(attribute: ExactJsxAttributeV1 | undefined): number | undefined {
	if (typeof attribute?.constant === 'number') return attribute.constant;
	if (typeof attribute?.constant === 'string' && /^-?\d+(?:\.\d+)?$/u.test(attribute.constant))
		return Number(attribute.constant);
	return undefined;
}

/** Tests the finite true spellings accepted by HTML and JSX projections. */
export function staticBoolean(attribute: ExactJsxAttributeV1 | undefined): boolean {
	return attribute?.constant === true || attribute?.constant === 'true';
}

/** Restricts package rules to compiler-resolved accessibility activations. */
export function isAccessibilityActivation(activation: ExactEnhancementActivationV1): boolean {
	return (
		activation.package?.name === '@exactjs/accessibility' ||
		activation.module?.startsWith('@exactjs/accessibility') === true
	);
}

/** Creates a package diagnostic that participates in the generic validation gate. */
export function diagnostic(
	severity: 'error' | 'warning' | 'information',
	source: { range: { start: number; end: number } },
	code: string,
	summary: string,
	related?: readonly { range: { start: number; end: number }; message: string }[]
): ExactLanguageDiagnosticV1 {
	return {
		code,
		severity,
		range: source.range,
		summary,
		...(related ? { related } : {}),
		documentation: ariaDataSource
	};
}

/** Creates non-failing native-platform guidance. */
export function information(
	source: { range: { start: number; end: number } },
	code: string,
	summary: string
): ExactLanguageDiagnosticV1 {
	return diagnostic('information', source, code, summary);
}

/** Creates an accessibility error diagnostic. */
export function error(
	source: { range: { start: number; end: number } },
	code: string,
	summary: string,
	related?: readonly { range: { start: number; end: number }; message: string }[]
): ExactLanguageDiagnosticV1 {
	return diagnostic('error', source, code, summary, related);
}

/** Creates an accessibility warning diagnostic. */
export function warning(
	source: { range: { start: number; end: number } },
	code: string,
	summary: string
): ExactLanguageDiagnosticV1 {
	return diagnostic('warning', source, code, summary);
}
