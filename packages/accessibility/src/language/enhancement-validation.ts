import type {
	ExactEnhancementActivationV1,
	ExactJsxLanguageFactV1,
	ExactLanguageDiagnosticV1
} from '@exactjs/language-extension-api';
import {
	attributeMap,
	error,
	isAccessibilityActivation,
	staticString,
	supportedNavigationRoles,
	warning
} from './facts.js';

/** Validates package enhancement composition against its finite target facts. */
export function validateEnhancements(
	activations: readonly ExactEnhancementActivationV1[],
	elements: readonly ExactJsxLanguageFactV1[],
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const byId = new Map(elements.map((element) => [element.id, element]));
	const groups = new Map<string, ExactEnhancementActivationV1[]>();
	for (const activation of activations.filter(isAccessibilityActivation)) {
		const group = groups.get(activation.targetJsxId) ?? [];
		group.push(activation);
		groups.set(activation.targetJsxId, group);
	}
	for (const [targetId, group] of groups) {
		const target = byId.get(targetId);
		if (!target) continue;
		const names = new Set(group.map((activation) => activation.activator));
		if ((names.has('initialFocus') || names.has('returnFocus')) && !names.has('focusScope'))
			diagnostics.push(
				error(
					group[0]!,
					'focus-companion',
					'a11y:initialFocus and a11y:returnFocus require a11y:focusScope.'
				)
			);
		validateNavigation(group, target, names, byId, diagnostics);
	}
}

function validateNavigation(
	group: readonly ExactEnhancementActivationV1[],
	target: ExactJsxLanguageFactV1,
	names: ReadonlySet<string>,
	byId: ReadonlyMap<string, ExactJsxLanguageFactV1>,
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	if (names.has('navigate')) {
		const role = staticString(attributeMap(target).get('role'));
		const activation = group.find((candidate) => candidate.activator === 'navigate')!;
		if (!role)
			diagnostics.push(
				error(
					activation,
					'navigation-role',
					'a11y:navigate requires one finite supported composite role.'
				)
			);
		else if (!supportedNavigationRoles.has(role))
			diagnostics.push(
				error(
					activation,
					'unsupported-navigation-role',
					`a11y:navigate does not ship a complete ${role} policy.`
				)
			);
		else
			validateNavigationStructure(
				activation,
				target,
				role,
				elementsWithin(target, byId),
				diagnostics
			);
		if (attributeMap(target).has('aria-activedescendant'))
			diagnostics.push(
				warning(
					attributeMap(target).get('aria-activedescendant')!,
					'active-descendant-ownership',
					'a11y:navigate owns active-descendant publication in that mode; do not also author aria-activedescendant.'
				)
			);
	}
	if (names.has('activeDescendant') && names.has('navigate')) {
		const activation = group.find((candidate) => candidate.activator === 'activeDescendant')!;
		diagnostics.push(
			warning(
				activation,
				'active-descendant-ownership',
				'a11y:activeDescendant conflicts when a11y:navigate uses active-descendant mode.'
			)
		);
	}
}

function validateNavigationStructure(
	activation: ExactEnhancementActivationV1,
	target: ExactJsxLanguageFactV1,
	role: string,
	descendants: readonly ExactJsxLanguageFactV1[],
	diagnostics: ExactLanguageDiagnosticV1[]
): void {
	const childRoles = descendants.map((element) => staticString(attributeMap(element).get('role')));
	const expected =
		role === 'tablist'
			? ['tab']
			: role === 'listbox'
				? ['option']
				: role === 'radiogroup'
					? ['radio']
					: role === 'grid'
						? ['gridcell', 'rowheader', 'columnheader']
						: [];
	if (expected.length && !childRoles.some((childRole) => childRole && expected.includes(childRole)))
		diagnostics.push(
			error(
				activation,
				'navigation-item-structure',
				`role="${role}" requires finite ${expected.map((value) => `role="${value}"`).join(' or ')} descendants.`
			)
		);
	if (role === 'grid' && !childRoles.includes('row'))
		diagnostics.push(
			warning(
				activation,
				'grid-row-structure',
				'Grid navigation expects cells grouped by role="row".'
			)
		);
	const state =
		role === 'tablist' ? 'aria-selected' : role === 'radiogroup' ? 'aria-checked' : undefined;
	if (state && !descendants.some((element) => attributeMap(element).has(state)))
		diagnostics.push(
			warning(
				activation,
				'navigation-state-contract',
				`a11y:navigate moves focus but does not author ${state}; the application must publish that state.`
			)
		);
	const nested = descendants.find((element) => {
		const childRole = staticString(attributeMap(element).get('role'));
		return childRole && supportedNavigationRoles.has(childRole);
	});
	if (nested)
		diagnostics.push(
			warning(
				{ range: nested.tagRange },
				'nested-navigation-owner',
				'Nested composite widgets own their own arrow-key range and are excluded from the outer navigation session.'
			)
		);
}

function elementsWithin(
	target: ExactJsxLanguageFactV1,
	byId: ReadonlyMap<string, ExactJsxLanguageFactV1>
): ExactJsxLanguageFactV1[] {
	return [...byId.values()].filter(
		(element) =>
			element.id !== target.id &&
			target.range.start < element.range.start &&
			element.range.end <= target.range.end
	);
}
