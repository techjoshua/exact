import type {
	ExactJsxAttributeV1,
	ExactJsxLanguageFactV1,
	ExactLanguageDiagnosticV1
} from '@exactjs/language-extension-api';
import { attributeMap, error, information, staticString, warning } from './facts.js';

type Intrinsic = ExactJsxLanguageFactV1 & { tag: string };

/** Validates relationships and native patterns that require more than one intrinsic. */
export function validateDocumentSemantics(
	elements: readonly Intrinsic[],
	ids: ReadonlyMap<string, Intrinsic>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	validateLabels(elements, ids, diagnostics);
	validateRelationshipGraph(elements, ids, diagnostics);
	validateLandmarks(elements, diagnostics);
	for (const element of elements) {
		const attributes = attributeMap(element);
		validateInteraction(element, attributes, diagnostics);
		validateCommandPair(element, attributes, diagnostics);
		validateNativePreference(element, attributes, diagnostics);
	}
}

function validateLandmarks(
	elements: readonly Intrinsic[],
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const groups = new Map<string, Intrinsic[]>();
	for (const element of elements) {
		const role = landmarkRole(element);
		if (!role) continue;
		const group = groups.get(role) ?? [];
		group.push(element);
		groups.set(role, group);
	}
	for (const [role, group] of groups) {
		if (group.length < 2 && role !== 'region') continue;
		for (const element of group) {
			const attributes = attributeMap(element);
			if (hasScalarName(attributes)) continue;
			diagnostics.push(
				warning(
					{ range: element.tagRange },
					'unnamed-landmark',
					`This ${role} landmark needs a finite accessible name to distinguish it from peers.`
				)
			);
		}
	}
}

/** Tests whether a finite native label points to or wraps a form control. */
export function hasFiniteLabel(element: Intrinsic, elements: readonly Intrinsic[]): boolean {
	const id = staticString(attributeMap(element).get('id'));
	return elements.some((candidate) => {
		if (candidate.tag !== 'label') return false;
		const attributes = attributeMap(candidate);
		const labelFor = staticString(attributes.get('for') ?? attributes.get('htmlFor'));
		return (id && labelFor === id) || contains(candidate, element);
	});
}

function validateLabels(
	elements: readonly Intrinsic[],
	ids: ReadonlyMap<string, Intrinsic>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	for (const label of elements.filter((element) => element.tag === 'label')) {
		const attributes = attributeMap(label);
		const attribute = attributes.get('for') ?? attributes.get('htmlFor');
		const targetId = staticString(attribute);
		if (!attribute || !targetId) continue;
		const target = ids.get(targetId);
		if (!target)
			diagnostics.push(
				warning(
					attribute,
					'unresolved-label-target',
					`Label target "${targetId}" is not finite in this source.`
				)
			);
		else if (
			!['button', 'input', 'meter', 'output', 'progress', 'select', 'textarea'].includes(target.tag)
		)
			diagnostics.push(
				error(attribute, 'invalid-label-target', `<${target.tag}> is not a labelable HTML element.`)
			);
	}
}

function validateRelationshipGraph(
	elements: readonly Intrinsic[],
	ids: ReadonlyMap<string, Intrinsic>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	for (const property of ['aria-flowto', 'aria-owns'] as const) {
		const edges = new Map<string, string[]>();
		const owners = new Map<string, ExactJsxAttributeV1>();
		for (const element of elements) {
			const attributes = attributeMap(element);
			const sourceId = staticString(attributes.get('id'));
			const attribute = attributes.get(property);
			const targets = staticString(attribute)?.trim().split(/\s+/u).filter(Boolean) ?? [];
			if (sourceId && targets.length) edges.set(sourceId, targets);
			if (property === 'aria-owns' && attribute)
				for (const target of targets) {
					const previous = owners.get(target);
					if (previous)
						diagnostics.push(
							error(
								attribute,
								'multiple-aria-owner',
								`"${target}" is owned by more than one finite aria-owns relationship.`,
								[{ range: previous.range, message: 'The other owner is declared here.' }]
							)
						);
					else owners.set(target, attribute);
				}
		}
		for (const [source, targets] of edges)
			for (const target of targets)
				if (ids.has(target) && reaches(edges, target, source, new Set())) {
					const attribute = attributeMap(ids.get(source)!).get(property)!;
					diagnostics.push(
						error(
							attribute,
							'aria-relationship-cycle',
							`${property} contains a finite cycle through "${target}".`
						)
					);
				}
	}
	for (const element of elements) {
		const attributes = attributeMap(element);
		const activeId = staticString(attributes.get('aria-activedescendant'));
		const active = activeId ? ids.get(activeId) : undefined;
		const owned = staticString(attributes.get('aria-owns'))?.split(/\s+/u) ?? [];
		const controlled = staticString(attributes.get('aria-controls'))?.split(/\s+/u) ?? [];
		const role = staticString(attributes.get('role'));
		if (
			active &&
			!contains(element, active) &&
			!owned.includes(activeId!) &&
			!(role === 'combobox' && controlled.includes(activeId!))
		)
			diagnostics.push(
				warning(
					attributes.get('aria-activedescendant')!,
					'active-descendant-membership',
					'The finite active descendant is not inside the owning composite.'
				)
			);
	}
}

function validateInteraction(
	element: Intrinsic,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const native =
		nativeInteractiveElements.has(element.tag) || (element.tag === 'a' && attributes.has('href'));
	if (!attributes.has('onClick') || native) return;
	const role = staticString(attributes.get('role'));
	const keyboard = attributes.has('onKeyDown') || attributes.has('onKeyUp');
	if (!keyboard)
		diagnostics.push(
			warning(
				attributes.get('onClick')!,
				'pointer-only-interaction',
				'Click behavior on a non-native target has no finite keyboard handler. Prefer a native control or add an equivalent keyboard path.'
			)
		);
	if (!role)
		diagnostics.push(
			warning(
				element,
				'interactive-semantics',
				'A click-like non-native target has no finite interactive role.'
			)
		);
	else if (interactiveRoles.has(role) && !attributes.has('tabIndex') && !attributes.has('tabindex'))
		diagnostics.push(
			warning(
				attributes.get('role')!,
				'nonfocusable-interaction',
				`role="${role}" is interactive but this non-native target has no finite tabIndex.`
			)
		);
}

function validateCommandPair(
	element: Intrinsic,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const hasCommandFor = attributes.has('commandFor') || attributes.has('commandfor');
	if (attributes.has('command') === hasCommandFor) return;
	diagnostics.push(
		error(
			element,
			'incomplete-native-command',
			'Native command and commandFor must be authored together.'
		)
	);
}

function validateNativePreference(
	element: Intrinsic,
	attributes: ReadonlyMap<string, ExactJsxAttributeV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const role = staticString(attributes.get('role'));
	const replacement = role === 'button' ? 'button' : role === 'link' ? 'a with href' : undefined;
	if (replacement && element.tag !== replacement.split(' ')[0])
		diagnostics.push(
			information(
				attributes.get('role')!,
				'prefer-native-control',
				`Prefer native <${replacement}> when it can express this interaction.`
			)
		);
}

function landmarkRole(element: Intrinsic): string | undefined {
	const attributes = attributeMap(element);
	const authored = staticString(attributes.get('role'));
	if (
		[
			'banner',
			'complementary',
			'contentinfo',
			'form',
			'main',
			'navigation',
			'region',
			'search'
		].includes(authored ?? '')
	)
		return authored;
	if (element.tag === 'nav') return 'navigation';
	if (element.tag === 'aside') return 'complementary';
	if (element.tag === 'main') return 'main';
	if (element.tag === 'form') return 'form';
	if (element.tag === 'section' && hasScalarName(attributes)) return 'region';
	return undefined;
}

function hasScalarName(attributes: ReadonlyMap<string, ExactJsxAttributeV1>): boolean {
	return ['aria-label', 'aria-labelledby', 'title'].some((name) => {
		const attribute = attributes.get(name);
		return (
			!!attribute && (attribute.valueKind === 'expression' || !!staticString(attribute)?.trim())
		);
	});
}

function reaches(
	edges: ReadonlyMap<string, readonly string[]>,
	current: string,
	target: string,
	seen: Set<string>
): boolean {
	if (current === target) return true;
	if (seen.has(current)) return false;
	seen.add(current);
	return (edges.get(current) ?? []).some((next) => reaches(edges, next, target, seen));
}

function contains(parent: Intrinsic, child: Intrinsic): boolean {
	return parent.range.start < child.range.start && child.range.end <= parent.range.end;
}

const nativeInteractiveElements = new Set(['button', 'input', 'select', 'textarea', 'summary']);
const interactiveRoles = new Set([
	'button',
	'checkbox',
	'combobox',
	'link',
	'listbox',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'radio',
	'slider',
	'spinbutton',
	'switch',
	'tab',
	'textbox',
	'treeitem'
]);
