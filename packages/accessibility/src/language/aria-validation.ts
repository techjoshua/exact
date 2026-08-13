import type {
	ExactJsxAttributeV1,
	ExactJsxLanguageFactV1,
	ExactLanguageDiagnosticV1
} from '@exactjs/language-extension-api';
import { ariaProperties, ariaRoles } from '../generated/aria-data.js';
import { attributeMap, error, staticBoolean, staticString, warning } from './facts.js';

const roleSet = new Set<string>(ariaRoles);
const propertyEntries = ariaProperties as Readonly<Record<string, string | readonly string[]>>;

/** Builds the finite ID index and reports duplicate authored IDs. */
export function indexStaticIds(
	elements: readonly (ExactJsxLanguageFactV1 & { tag: string })[],
	diagnostics: ExactLanguageDiagnosticV1[]
): ReadonlyMap<string, ExactJsxLanguageFactV1 & { tag: string }> {
	const ids = new Map<string, ExactJsxLanguageFactV1 & { tag: string }>();
	for (const element of elements) {
		const attribute = attributeMap(element).get('id');
		const id = staticString(attribute);
		if (!id) continue;
		const previous = ids.get(id);
		if (previous)
			diagnostics.push(
				error(attribute!, 'duplicate-id', `Duplicate static ID "${id}".`, [
					{ range: previous.tagRange, message: 'The first element with this ID is here.' }
				])
			);
		else ids.set(id, element);
	}
	return ids;
}

/** Validates finite role and ARIA property facts for one intrinsic. */
export function validateAriaElement(
	element: ExactJsxLanguageFactV1 & { tag: string },
	role: string | undefined,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	ids: ReadonlyMap<string, ExactJsxLanguageFactV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	if (role && !roleSet.has(role))
		diagnostics.push(
			error(attributes.get('role')!, 'unknown-role', `Unknown ARIA role "${role}".`)
		);
	if (role === 'dialog' && element.tag !== 'dialog' && staticBoolean(attributes.get('aria-modal')))
		diagnostics.push(
			warning(
				attributes.get('role')!,
				'custom-modal',
				'Use native <dialog> with modal:isOpen for modal behavior instead of reproducing top-layer, inertness, and focus containment.'
			)
		);
	for (const attribute of element.attributes) validateProperty(attribute, ids, diagnostics);
	validateRolePropertyCompatibility(role, attributes, diagnostics);
	if (attributes.has('aria-errormessage') && !staticBoolean(attributes.get('aria-invalid')))
		diagnostics.push(
			warning(
				attributes.get('aria-errormessage')!,
				'errormessage-without-invalid',
				'aria-errormessage is exposed when aria-invalid is true; coordinate the two states.'
			)
		);
}

/** Returns the generated value domain for editor hover and completion text. */
export function ariaPropertyDomain(name: string): string | readonly string[] | undefined {
	return propertyEntries[name];
}

function validateProperty(
	attribute: ExactJsxAttributeV1,
	ids: ReadonlyMap<string, ExactJsxLanguageFactV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	if (!attribute.name.startsWith('aria-')) return;
	const name = attribute.name.slice(5).toLowerCase();
	const domain = propertyEntries[name];
	if (!domain) {
		diagnostics.push(
			error(attribute, 'unknown-aria-property', `Unknown ARIA property "${attribute.name}".`)
		);
		return;
	}
	const value = staticString(attribute);
	if (value !== undefined && Array.isArray(domain) && !domain.includes(value.toLowerCase()))
		diagnostics.push(
			error(
				attribute,
				'invalid-aria-token',
				`${attribute.name} must be one of: ${domain.join(', ')}.`
			)
		);
	if (value !== undefined && domain === 'integer' && !/^-?\d+$/u.test(value))
		diagnostics.push(
			error(attribute, 'invalid-aria-integer', `${attribute.name} must be an integer.`)
		);
	if (value !== undefined && domain === 'number' && !Number.isFinite(Number(value)))
		diagnostics.push(
			error(attribute, 'invalid-aria-number', `${attribute.name} must be a number.`)
		);
	if (value === undefined || (domain !== 'id' && domain !== 'ids')) return;
	const tokens = value.trim().split(/\s+/u).filter(Boolean);
	if (domain === 'id' && tokens.length !== 1)
		diagnostics.push(
			error(attribute, 'invalid-id-cardinality', `${attribute.name} accepts one ID.`)
		);
	for (const token of tokens)
		if (!ids.has(token))
			diagnostics.push(
				warning(
					attribute,
					'unresolved-id-reference',
					`${attribute.name} references "${token}", which is not present in this compiler-finite source region.`
				)
			);
}

function validateRolePropertyCompatibility(
	role: string | undefined,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const rules: ReadonlyArray<[string, readonly string[]]> = [
		['aria-checked', ['checkbox', 'menuitemcheckbox', 'menuitemradio', 'radio', 'switch']],
		['aria-selected', ['gridcell', 'option', 'row', 'tab', 'treeitem']],
		['aria-pressed', ['button']],
		['aria-modal', ['dialog', 'alertdialog']],
		['aria-valuenow', ['meter', 'progressbar', 'scrollbar', 'separator', 'slider', 'spinbutton']]
	];
	for (const [name, roles] of rules) {
		const attribute = attributes.get(name);
		if (attribute && role && !roles.includes(role))
			diagnostics.push(
				warning(attribute, 'role-property-mismatch', `${name} is not supported by role="${role}".`)
			);
	}
}
