import { resolveElementId, unwrap, type RefBinding } from '@exactjs/core';
import { computed, type ReactiveValue } from '@exactjs/reactive';
import type { AccessibilityProps, AriaRefList, OptionalAriaRef } from './contracts.js';

type RelationshipContributions = Readonly<Record<string, ReactiveValue<string | undefined>>>;

/** Creates reactive target contributions for every supported ARIA ID-reference property. */
export function createRelationshipContributions(
	props: AccessibilityProps
): RelationshipContributions {
	return {
		'aria-activedescendant': computed(() => singleRelationship(props.activeDescendant)),
		'aria-controls': computed(() => listRelationship(props.controls)),
		'aria-describedby': computed(() => listRelationship(props.describedBy)),
		'aria-details': computed(() => singleRelationship(props.details)),
		'aria-errormessage': computed(() => singleRelationship(props.errorMessage)),
		'aria-flowto': computed(() => listRelationship(props.flowTo)),
		'aria-labelledby': computed(() => listRelationship(props.labelledBy)),
		'aria-owns': computed(() => listRelationship(props.owns))
	};
}

function singleRelationship(source: OptionalAriaRef): string | undefined {
	const binding = unwrap(source);
	return isRefBinding(binding) ? resolveElementId(binding) : undefined;
}

function listRelationship(source: AriaRefList): string | undefined {
	const value = unwrap(source);
	if (!value) return undefined;
	const bindings = Array.isArray(value) ? value : [value];
	const ids: string[] = [];
	for (const candidate of bindings) {
		const binding = unwrap(candidate);
		if (!isRefBinding(binding)) continue;
		const id = resolveElementId(binding);
		if (id && !ids.includes(id)) ids.push(id);
	}
	return ids.length ? ids.join(' ') : undefined;
}

function isRefBinding(value: unknown): value is RefBinding<Element> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'current' in value &&
		'key' in value &&
		typeof (value as RefBinding<unknown>).fulfill === 'function'
	);
}
