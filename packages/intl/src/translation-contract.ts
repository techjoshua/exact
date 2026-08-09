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

/** Projects exact execution operations into stable translator-facing placeholder references. */
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
		Object.freeze(
			pattern.map((node, index): IntlTranslationPatternNodeV1 => {
				if (node.kind === 'text') return Object.freeze({ ...node });
				const id = `${path}${index}`;
				if (node.kind === 'value') {
					const declared = binding(node.binding);
					placeholders.push(
						placeholder(id, 'value', declared.type, declared.name ?? `value-${node.binding}`, true)
					);
					return Object.freeze({ kind: 'placeholder', id });
				}
				if (node.kind === 'format') {
					const declared = binding(node.bindings[0]!);
					placeholders.push(
						placeholder(
							id,
							'format',
							node.formatter.kind,
							declared.name ?? node.formatter.kind,
							true
						)
					);
					return Object.freeze({ kind: 'placeholder', id });
				}
				if (node.kind === 'opaque') {
					placeholders.push(placeholder(id, 'opaque', 'structure', node.name, false));
					return Object.freeze({ kind: 'placeholder', id });
				}
				if (node.kind === 'element') {
					const declared = binding(node.binding);
					placeholders.push(
						placeholder(id, 'element', 'structure', declared.name ?? 'element', false)
					);
					return Object.freeze({ kind: 'element', id, value: project(node.value, `${id}.`) });
				}
				const declared = binding(node.binding);
				placeholders.push(
					placeholder(id, 'select', node.selection, declared.name ?? node.selection, false)
				);
				return Object.freeze({
					kind: 'select',
					id,
					cases: Object.freeze(
						node.cases.map((candidate, caseIndex) =>
							Object.freeze({
								key: candidate.key,
								value: project(candidate.value, `${id}.c${caseIndex}.`)
							})
						)
					),
					fallback: project(node.fallback, `${id}.f.`)
				});
			})
		);
	return Object.freeze({ source: project(source), placeholders: Object.freeze(placeholders) });
}

/** Reattaches current execution metadata to one validated generic translation. */
export function materializeIntlTranslation(
	translation: IntlTranslationPatternV1,
	descriptor: IntlRuntimeDescriptorV1
): IntlPatternV1 {
	const exactById = exactNodeMap(descriptor.bindings, descriptor.source);
	const materialize = (pattern: IntlTranslationPatternV1): IntlPatternV1 =>
		Object.freeze(
			pattern.map((node): IntlPatternNodeV1 => {
				if (node.kind === 'text') return Object.freeze({ ...node });
				const exact = exactById.get(node.id);
				if (!exact)
					throw new TypeError(`Intl translation references unknown placeholder ${node.id}`);
				if (node.kind === 'placeholder') {
					if (exact.kind === 'text' || exact.kind === 'element' || exact.kind === 'select')
						throw new TypeError(`Intl placeholder ${node.id} has an incompatible structure`);
					return exact;
				}
				if (node.kind === 'element') {
					if (exact.kind !== 'element')
						throw new TypeError(`Intl element ${node.id} has an incompatible structure`);
					return Object.freeze({ ...exact, value: materialize(node.value) });
				}
				if (exact.kind !== 'select')
					throw new TypeError(`Intl selector ${node.id} has an incompatible structure`);
				return Object.freeze({
					...exact,
					cases: Object.freeze(
						node.cases.map((candidate) =>
							Object.freeze({ key: candidate.key, value: materialize(candidate.value) })
						)
					),
					fallback: materialize(node.fallback)
				});
			})
		);
	return materialize(translation);
}

/** Converts a legacy exact-pattern catalog entry into generic placeholder references. */
export function projectLegacyIntlTranslation(
	pattern: IntlPatternV1,
	descriptor: IntlRuntimeDescriptorV1
): IntlTranslationPatternV1 {
	const sourceProjection = projectIntlTranslationContract(descriptor.bindings, descriptor.source);
	const exactIds = new Map<string, string>();
	const index = (generic: IntlTranslationPatternV1, exact: IntlPatternV1): void => {
		for (let position = 0; position < generic.length; position++) {
			const genericNode = generic[position]!;
			const exactNode = exact[position]!;
			if (genericNode.kind === 'text') continue;
			if (exactNode.kind === 'text')
				throw new TypeError('Intl translation projection disagrees with its execution pattern');
			exactIds.set(exactNodeIdentity(exactNode), genericNode.id);
			if (genericNode.kind === 'element' && exactNode.kind === 'element')
				index(genericNode.value, exactNode.value);
			if (genericNode.kind === 'select' && exactNode.kind === 'select') {
				for (let branch = 0; branch < genericNode.cases.length; branch++)
					index(genericNode.cases[branch]!.value, exactNode.cases[branch]!.value);
				index(genericNode.fallback, exactNode.fallback);
			}
		}
	};
	index(sourceProjection.source, descriptor.source);
	const project = (nodes: IntlPatternV1): IntlTranslationPatternV1 =>
		Object.freeze(
			nodes.map((node): IntlTranslationPatternNodeV1 => {
				if (node.kind === 'text') return Object.freeze({ ...node });
				const id = exactIds.get(exactNodeIdentity(node));
				if (!id)
					throw new TypeError(
						'Legacy intl translation contains an operation absent from its source'
					);
				if (node.kind === 'value' || node.kind === 'format' || node.kind === 'opaque')
					return Object.freeze({ kind: 'placeholder', id });
				if (node.kind === 'element')
					return Object.freeze({ kind: 'element', id, value: project(node.value) });
				return Object.freeze({
					kind: 'select',
					id,
					cases: Object.freeze(
						node.cases.map((candidate) =>
							Object.freeze({ key: candidate.key, value: project(candidate.value) })
						)
					),
					fallback: project(node.fallback)
				});
			})
		);
	return project(pattern);
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
	return Object.freeze({ id, kind, role, name, canCopy, canDelete: false });
}

function exactNodeIdentity(node: Exclude<IntlPatternNodeV1, { kind: 'text' }>): string {
	if (node.kind === 'value') return `value:${node.binding}`;
	if (node.kind === 'format') return `format:${JSON.stringify(node)}`;
	if (node.kind === 'opaque') return `opaque:${node.binding}:${node.name}`;
	if (node.kind === 'element') return `element:${node.binding}`;
	return `select:${node.binding}:${node.rangeBinding ?? ''}:${node.selection}`;
}
