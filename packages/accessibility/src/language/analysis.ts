import type {
	ExactEnhancementActivationV1,
	ExactJsxAttributeV1,
	ExactJsxLanguageFactV1,
	ExactLanguageDiagnosticV1,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import { ariaDataSource } from '../generated/aria-data.js';
import { ariaPropertyDomain, indexStaticIds, validateAriaElement } from './aria-validation.js';
import { validateDocumentSemantics } from './document-validation.js';
import { validateEnhancements } from './enhancement-validation.js';
import {
	attributeMap,
	isAccessibilityActivation,
	staticString,
	supportedNavigationRoles
} from './facts.js';
import { validateIntrinsicSemantics } from './intrinsic-validation.js';

/** Runs finite source-only accessibility checks against one language projection. */
export function accessibilityDiagnostics(
	projection: ExactLanguageProjectionV1
): readonly ExactLanguageDiagnosticV1[] {
	const source = projection.document.text ?? '';
	const diagnostics: ExactLanguageDiagnosticV1[] = [];
	const intrinsics = projection.jsx.filter(
		(element): element is ExactJsxLanguageFactV1 & { tag: string } =>
			element.kind === 'intrinsic' && !!element.tag
	);
	const ids = indexStaticIds(intrinsics, diagnostics);
	validateDocumentSemantics(intrinsics, ids, diagnostics);
	for (const element of intrinsics) {
		const attributes = attributeMap(element);
		const role = staticString(attributes.get('role'))?.toLowerCase();
		validateAriaElement(element, role, attributes, ids, diagnostics);
		validateIntrinsicSemantics(element, intrinsics, source, role, attributes, ids, diagnostics);
	}
	validateEnhancements(projection.enhancements, projection.jsx, diagnostics);
	return Object.freeze(diagnostics);
}

/** Describes the accessibility inference active at one source position. */
export function accessibilityHover(
	projection: ExactLanguageProjectionV1,
	position: number
): { range: { start: number; end: number }; markdown: string } | undefined {
	const element = projection.jsx
		.filter((candidate) => candidate.range.start <= position && position <= candidate.range.end)
		.sort(
			(left, right) => left.range.end - left.range.start - (right.range.end - right.range.start)
		)[0];
	if (!element) return undefined;
	const activations = projection.enhancements.filter(
		(candidate) => candidate.targetJsxId === element.id && isAccessibilityActivation(candidate)
	);
	const attribute = element.attributes.find(
		(candidate) => candidate.range.start <= position && position <= candidate.range.end
	);
	const activation = activations.find(
		(candidate) => candidate.range.start <= position && position <= candidate.range.end
	);
	if (activation) return activationHover(element, activation);
	if (attribute?.name.startsWith('aria-')) return ariaHover(attribute);
	if (attribute?.name === 'role') {
		const role = staticString(attribute);
		return {
			range: attribute.range,
			markdown: `### ARIA role\n\n**Resolved role:** \`${role ?? 'dynamic'}\`\n\nRole and property compatibility is checked from the pinned ${ariaDataSource} projection.`
		};
	}
	if (element.kind === 'intrinsic' && element.tag && position <= element.openingRange.end)
		return accessibleElementHover(
			element as ExactJsxLanguageFactV1 & { tag: string },
			projection.document.text ?? ''
		);
	return undefined;
}

function accessibleElementHover(
	element: ExactJsxLanguageFactV1 & { tag: string },
	source: string
): { range: { start: number; end: number }; markdown: string } {
	const attributes = attributeMap(element);
	const ordered = ['aria-labelledby', 'aria-label', 'alt', 'title'];
	const sourceAttribute = ordered.find((name) => attributes.has(name));
	let inference = sourceAttribute ? `\`${sourceAttribute}\`` : 'no finite scalar name source';
	let reason = sourceAttribute ? 'finite-attribute' : 'missing-name';
	if (!sourceAttribute) {
		const interior = source.slice(element.openingRange.end, element.range.end);
		if (/\{[^}]+\}/u.test(interior)) {
			inference = 'dynamic authored children';
			reason = 'dynamic-name';
		} else if (/<[A-Z_$]/u.test(interior)) {
			inference = 'opaque component children';
			reason = 'opaque-target';
		} else if (interior.replace(/<[^>]*>/gu, ' ').trim()) {
			inference = 'authored text content';
			reason = 'finite-content';
		}
	}
	return {
		range: element.tagRange,
		markdown: `### Accessible semantics\n\n**Name evidence:** ${inference}\n\n**Reason:** \`${reason}\`. Dynamic or opaque evidence is treated as unproven, not as an accessibility failure.`
	};
}

function activationHover(
	element: ExactJsxLanguageFactV1,
	activation: ExactEnhancementActivationV1
): { range: { start: number; end: number }; markdown: string } {
	const role = staticString(attributeMap(element).get('role'));
	const detail =
		activation.activator === 'navigate'
			? role && supportedNavigationRoles.has(role)
				? `Complete \`${role}\` keyboard policy; runtime defaults are inferred from the role.`
				: 'No runtime policy is selected until the target has a supported finite role.'
			: activation.activator === 'focusScope'
				? 'Focus entry and restoration only; native dialog owns modality and inertness.'
				: `Ref-based \`aria-${camelToAria(activation.activator)}\` relationship with stable generated identity.`;
	return {
		range: activation.range,
		markdown: `### Accessibility enhancement\n\n**Activator:** \`a11y:${activation.activator}\`\n\n${detail}`
	};
}

function ariaHover(attribute: ExactJsxAttributeV1): {
	range: { start: number; end: number };
	markdown: string;
} {
	const property = attribute.name.slice(5).toLowerCase();
	const domain = ariaPropertyDomain(property);
	return {
		range: attribute.range,
		markdown: `### ${attribute.name}\n\n**Value contract:** ${Array.isArray(domain) ? domain.map((value) => `\`${value}\``).join(', ') : (domain ?? 'unknown')}\n\nValidated against ${ariaDataSource}.`
	};
}

function camelToAria(value: string): string {
	return value.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);
}
