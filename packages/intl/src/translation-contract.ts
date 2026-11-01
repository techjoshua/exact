import { copyIntlProtocolData } from './protocol-data.js';
import type {
	IntlBindingDescriptorV1,
	IntlPatternNodeV1,
	IntlPatternV1,
	IntlRuntimeDescriptorV1,
	IntlTranslationPatternNodeV1,
	IntlTranslationPatternV1,
	IntlTranslationPlaceholderV1
} from './contracts.js';

/** Generic translation source and placeholder guide derived from one execution pattern. */
export interface IntlTranslationContractProjection {
	readonly source: IntlTranslationPatternV1;
	readonly placeholders: readonly IntlTranslationPlaceholderV1[];
}

/** Projects execution operations into independent translator-facing data with ordinary TypeScript readonly fields. */
export function projectIntlTranslationContract(
	bindings: readonly IntlBindingDescriptorV1[],
	source: IntlPatternV1
): IntlTranslationContractProjection {
	const placeholders: IntlTranslationPlaceholderV1[] = [];
	const binding = (index: number): IntlBindingDescriptorV1 => {
		const value = bindings[index];
		if (!value) throw new TypeError(`Intl pattern references missing binding ${index}`);
		return value;
	};
	const project = (pattern: IntlPatternV1, path = 'n'): IntlTranslationPatternV1 =>
		pattern.map((node, index): IntlTranslationPatternNodeV1 => {
			if (node.kind === 'text') return { ...node };
			const id = `${path}${index}`;
			if (node.kind === 'value') {
				const declared = binding(node.binding);
				placeholders.push(
					placeholder(id, 'value', declared.type, declared.name ?? `value-${node.binding}`, true)
				);
				return { kind: 'placeholder', id };
			}
			if (node.kind === 'format') {
				const declared = binding(node.bindings[0]!);
				placeholders.push(
					placeholder(id, 'format', node.formatter.kind, declared.name ?? node.formatter.kind, true)
				);
				return { kind: 'placeholder', id };
			}
			if (node.kind === 'opaque') {
				placeholders.push(placeholder(id, 'opaque', 'structure', node.name, false));
				return { kind: 'placeholder', id };
			}
			if (node.kind === 'element') {
				const declared = binding(node.binding);
				placeholders.push(
					placeholder(id, 'element', 'structure', declared.name ?? 'element', false)
				);
				return { kind: 'element', id, value: project(node.value, `${id}.`) };
			}
			const declared = binding(node.binding);
			placeholders.push(
				placeholder(id, 'select', node.selection, declared.name ?? node.selection, false)
			);
			return {
				kind: 'select',
				id,
				cases: node.cases.map((candidate, caseIndex) => ({
					key: candidate.key,
					value: project(candidate.value, `${id}.c${caseIndex}.`)
				})),
				fallback: project(node.fallback, `${id}.f.`)
			};
		});
	return { source: project(source), placeholders };
}

/** Reattaches execution metadata to a validated translation without sharing mutable data with its descriptor. */
export function materializeIntlTranslation(
	translation: IntlTranslationPatternV1,
	descriptor: IntlRuntimeDescriptorV1
): IntlPatternV1 {
	const exactById = exactNodeMap(descriptor.bindings, descriptor.source);
	const materialize = (pattern: IntlTranslationPatternV1): IntlPatternV1 =>
		pattern.map((node): IntlPatternNodeV1 => {
			if (node.kind === 'text') return { ...node };
			const exact = exactById.get(node.id);
			if (!exact) throw new TypeError(`Intl translation references unknown placeholder ${node.id}`);
			if (node.kind === 'placeholder') {
				if (exact.kind === 'text' || exact.kind === 'element' || exact.kind === 'select')
					throw new TypeError(`Intl placeholder ${node.id} has an incompatible structure`);
				return copyIntlProtocolData(exact);
			}
			if (node.kind === 'element') {
				if (exact.kind !== 'element')
					throw new TypeError(`Intl element ${node.id} has an incompatible structure`);
				return { ...exact, value: materialize(node.value) };
			}
			if (exact.kind !== 'select')
				throw new TypeError(`Intl selector ${node.id} has an incompatible structure`);
			return {
				...exact,
				cases: node.cases.map((candidate) => ({
					key: candidate.key,
					value: materialize(candidate.value)
				})),
				fallback: materialize(node.fallback)
			};
		});
	return materialize(translation);
}

function exactNodeMap(
	bindings: readonly IntlBindingDescriptorV1[],
	pattern: IntlPatternV1
): ReadonlyMap<string, IntlPatternNodeV1> {
	const projection = projectIntlTranslationContract(bindings, pattern);
	const result = new Map<string, IntlPatternNodeV1>();
	const visit = (generic: IntlTranslationPatternV1, exact: IntlPatternV1): void => {
		for (let index = 0; index < generic.length; index++) {
			const genericNode = generic[index]!;
			const exactNode = exact[index]!;
			if (genericNode.kind === 'text') continue;
			result.set(genericNode.id, exactNode);
			if (genericNode.kind === 'element' && exactNode.kind === 'element')
				visit(genericNode.value, exactNode.value);
			if (genericNode.kind === 'select' && exactNode.kind === 'select') {
				for (let branch = 0; branch < genericNode.cases.length; branch++)
					visit(genericNode.cases[branch]!.value, exactNode.cases[branch]!.value);
				visit(genericNode.fallback, exactNode.fallback);
			}
		}
	};
	visit(projection.source, pattern);
	return result;
}

function placeholder(
	id: string,
	kind: IntlTranslationPlaceholderV1['kind'],
	role: string,
	name: string,
	canCopy: boolean
): IntlTranslationPlaceholderV1 {
	return { id, kind, role, name, canCopy, canDelete: false };
}
