import type {
	ExactJsxAttributeV1,
	ExactJsxLanguageFactV1,
	ExactLanguageDiagnosticV1
} from '@exactjs/language-extension-api';
import { attributeMap, error, staticNumber, staticString, warning } from './facts.js';
import { hasFiniteLabel } from './document-validation.js';

const commandValues = new Set([
	'show-modal',
	'close',
	'request-close',
	'show-popover',
	'hide-popover',
	'toggle-popover'
]);

/** Validates finite native interaction and naming facts for one intrinsic. */
export function validateIntrinsicSemantics(
	element: ExactJsxLanguageFactV1 & { tag: string },
	elements: readonly (ExactJsxLanguageFactV1 & { tag: string })[],
	source: string,
	role: string | undefined,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	ids: ReadonlyMap<string, ExactJsxLanguageFactV1 & { tag: string }>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	validateTabIndex(attributes, diagnostics);
	validateAccessibleName(element, elements, source, role, attributes, diagnostics);
	validateCommands(element, attributes, ids, diagnostics);
	validateLiveRegion(role, attributes, diagnostics);
}

function validateTabIndex(
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const attribute = attributes.get('tabindex') ?? attributes.get('tabIndex');
	const value = staticNumber(attribute);
	if (attribute && value !== undefined && value > 0)
		diagnostics.push(
			warning(
				attribute,
				'positive-tabindex',
				'Positive tabIndex creates a second focus order. Use DOM order with tabIndex={0} or {-1}.'
			)
		);
}

function validateAccessibleName(
	element: ExactJsxLanguageFactV1 & { tag: string },
	elements: readonly (ExactJsxLanguageFactV1 & { tag: string })[],
	source: string,
	role: string | undefined,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const inputType = staticString(attributes.get('type'))?.toLowerCase();
	const requiresName =
		element.tag === 'button' ||
		element.tag === 'img' ||
		(element.tag === 'input' && inputType !== 'hidden') ||
		element.tag === 'select' ||
		element.tag === 'textarea' ||
		element.tag === 'dialog' ||
		(element.tag === 'a' && attributes.has('href')) ||
		[
			'button',
			'checkbox',
			'dialog',
			'link',
			'listbox',
			'radio',
			'searchbox',
			'slider',
			'switch',
			'tab',
			'textbox'
		].includes(role ?? '');
	if (
		!requiresName ||
		(element.tag === 'img' && attributes.has('alt')) ||
		hasNameSource(element, source, role, attributes) ||
		hasFiniteLabel(element, elements) ||
		hasNativeInputName(element, inputType, attributes)
	)
		return;
	diagnostics.push(
		warning(
			{ range: element.tagRange },
			'no-provable-accessible-name',
			`No finite accessible-name source is visible for ${element.tag}. Add authored text, a native label, aria-label, or aria-labelledby.`
		)
	);
}

function validateCommands(
	element: ExactJsxLanguageFactV1 & { tag: string },
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	ids: ReadonlyMap<string, ExactJsxLanguageFactV1 & { tag: string }>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const command = attributes.get('command');
	const commandFor = attributes.get('commandFor') ?? attributes.get('commandfor');
	if (!command && !commandFor) return;
	if (element.tag !== 'button') {
		diagnostics.push(
			error(
				command ?? commandFor!,
				'invalid-command-host',
				'Native command and commandFor require a button.'
			)
		);
		return;
	}
	const value = staticString(command);
	if (command && value && !commandValues.has(value))
		diagnostics.push(error(command, 'invalid-command', `Unsupported native command "${value}".`));
	const targetId = staticString(commandFor);
	const target = targetId ? ids.get(targetId) : undefined;
	if (targetId && !target)
		diagnostics.push(
			warning(
				commandFor!,
				'unresolved-command-target',
				`commandFor target "${targetId}" is not finite in this source.`
			)
		);
	if (
		target &&
		value &&
		['show-modal', 'close', 'request-close'].includes(value) &&
		target.tag !== 'dialog'
	)
		diagnostics.push(
			error(command!, 'command-target-mismatch', `${value} requires a dialog target.`)
		);
	if (target && value?.includes('popover') && !attributeMap(target).has('popover'))
		diagnostics.push(
			error(command!, 'command-target-mismatch', `${value} requires a popover target.`)
		);
}

function validateLiveRegion(
	role: string | undefined,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const live = staticString(attributes.get('aria-live'));
	if (role === 'alert' && live && live !== 'assertive')
		diagnostics.push(
			warning(
				attributes.get('aria-live')!,
				'live-role-conflict',
				'role="alert" already has assertive live-region semantics.'
			)
		);
	if ((role === 'status' || role === 'log') && live === 'assertive')
		diagnostics.push(
			warning(
				attributes.get('aria-live')!,
				'live-role-conflict',
				`role="${role}" is normally polite; assertive announcements should be exceptional.`
			)
		);
}

function hasNameSource(
	element: ExactJsxLanguageFactV1,
	source: string,
	role: string | undefined,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>
): boolean {
	for (const name of ['aria-label', 'aria-labelledby', 'title', 'alt']) {
		const attribute = attributes.get(name);
		if (attribute && (attribute.valueKind === 'expression' || !!staticString(attribute)?.trim()))
			return true;
	}
	if (
		!['button', 'a', 'summary'].includes(element.tag ?? '') &&
		!['button', 'link', 'tab'].includes(role ?? '')
	)
		return false;
	const interior = source.slice(element.openingRange.end, element.range.end);
	if (/\{[^}]+\}/u.test(interior) || /<[A-Z_$]/u.test(interior)) return true;
	const text = source
		.slice(element.openingRange.end, element.range.end)
		.replace(/<[^>]*>/gu, ' ')
		.replace(/\{[^}]*\}/gu, ' ')
		.trim();
	return !!text;
}

function hasNativeInputName(
	element: ExactJsxLanguageFactV1 & { tag: string },
	type: string | undefined,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>
): boolean {
	if (element.tag !== 'input') return false;
	if (type === 'image') return !!attributes.get('alt');
	return ['button', 'submit', 'reset'].includes(type ?? '') && !!attributes.get('value');
}
