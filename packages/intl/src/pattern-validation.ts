import type {
	IntlBindingDescriptorV1,
	IntlPatternNodeV1,
	IntlPatternV1,
	IntlSelectionV1
} from './contracts.js';
import type { IntlValidationLimits } from './descriptor-validation.js';
import { validateFormatter } from './formatter-validation.js';
import {
	requireBinding,
	requireBoundedString,
	requireExactKeys,
	requireRecord
} from './validation-primitives.js';

type ValidationBudget = {
	remaining: number;
	readonly maxDepth: number;
	readonly maxTextLength: number;
};

/** Internal domain operation that validation budget without publishing an application API. */
export function validationBudget(limits: IntlValidationLimits): ValidationBudget {
	return {
		remaining: limits.maxNodes ?? 4096,
		maxDepth: limits.maxDepth ?? 64,
		maxTextLength: limits.maxTextLength ?? 64 * 1024
	};
}

/** Internal domain operation that validate pattern without publishing an application API. */
export function validatePattern(
	input: unknown,
	bindings: readonly IntlBindingDescriptorV1[],
	budget: ValidationBudget,
	depth: number,
	path: string
): IntlPatternV1 {
	if (!Array.isArray(input)) throw new TypeError(`${path} must be an array`);
	if (depth > budget.maxDepth) throw new TypeError(`${path} exceeds intl nesting limits`);
	return Object.freeze(
		input.map((node, index) => validateNode(node, bindings, budget, depth, `${path}[${index}]`))
	);
}

function validateNode(
	input: unknown,
	bindings: readonly IntlBindingDescriptorV1[],
	budget: ValidationBudget,
	depth: number,
	path: string
): IntlPatternNodeV1 {
	if (--budget.remaining < 0) throw new TypeError('Intl pattern exceeds node limits');
	const node = requireRecord(input, path);
	switch (node.kind) {
		case 'text': {
			requireExactKeys(node, ['kind', 'value']);
			const value = requireBoundedString(node.value, `${path}.value`, budget.maxTextLength);
			return Object.freeze({ kind: 'text', value });
		}
		case 'value': {
			requireExactKeys(node, ['kind', 'binding']);
			const binding = requireBinding(node.binding, bindings, `${path}.binding`);
			if (binding.kind === 'element' || binding.kind === 'opaque')
				throw new TypeError(`${path} cannot render a structural binding as a scalar value`);
			return Object.freeze({ kind: 'value', binding: binding.index });
		}
		case 'format': {
			requireExactKeys(node, ['kind', 'bindings', 'formatter']);
			if (!Array.isArray(node.bindings) || node.bindings.length === 0)
				throw new TypeError(`${path}.bindings must be a nonempty array`);
			const indexes = Object.freeze(
				node.bindings.map((binding, index) => {
					const declared = requireBinding(binding, bindings, `${path}.bindings[${index}]`);
					if (declared.kind === 'element' || declared.kind === 'opaque')
						throw new TypeError(`${path} cannot format a structural binding`);
					return declared.index;
				})
			);
			return Object.freeze({
				kind: 'format',
				bindings: indexes,
				formatter: validateFormatter(node.formatter, bindings, path)
			});
		}
		case 'select': {
			requireExactKeys(
				node,
				['kind', 'binding', 'rangeBinding', 'selection', 'cases', 'fallback'],
				['rangeBinding']
			);
			const binding = requireBinding(node.binding, bindings, `${path}.binding`);
			if (binding.kind !== 'selector') throw new TypeError(`${path} requires a selector binding`);
			const selection = String(node.selection);
			if (
				![
					'boolean',
					'exact',
					'plural-cardinal',
					'plural-ordinal',
					'plural-range-cardinal',
					'plural-range-ordinal'
				].includes(selection)
			)
				throw new TypeError(`${path} has an unsupported selection kind`);
			const pluralSelection = selection.startsWith('plural-');
			if (pluralSelection && binding.type !== 'number')
				throw new TypeError(`${path} plural selection requires numeric selector bindings`);
			const rangeSelection =
				node.selection === 'plural-range-cardinal' || node.selection === 'plural-range-ordinal';
			let rangeBinding: number | undefined;
			if (rangeSelection) {
				const declared = requireBinding(node.rangeBinding, bindings, `${path}.rangeBinding`);
				if (declared.kind !== 'selector')
					throw new TypeError(`${path} requires a second selector binding`);
				if (declared.type !== 'number')
					throw new TypeError(`${path} plural-range selection requires numeric selector bindings`);
				rangeBinding = declared.index;
			} else if (node.rangeBinding !== undefined) {
				throw new TypeError(`${path}.rangeBinding is supported only for plural-range selection`);
			}
			if (!Array.isArray(node.cases)) throw new TypeError(`${path}.cases must be an array`);
			const keys = new Set<string>();
			const cases = Object.freeze(
				node.cases.map((entry, index) => {
					const candidate = requireRecord(entry, `${path}.cases[${index}]`);
					requireExactKeys(candidate, ['key', 'value']);
					const key = requireBoundedString(candidate.key, `${path}.cases[${index}].key`);
					if (keys.has(key)) throw new TypeError(`${path} contains duplicate case "${key}"`);
					keys.add(key);
					return Object.freeze({
						key,
						value: validatePattern(
							candidate.value,
							bindings,
							budget,
							depth + 1,
							`${path}.cases[${index}].value`
						)
					});
				})
			);
			return Object.freeze({
				kind: 'select',
				binding: binding.index,
				...(rangeBinding === undefined ? {} : { rangeBinding }),
				selection: node.selection as IntlSelectionV1,
				cases,
				fallback: validatePattern(node.fallback, bindings, budget, depth + 1, `${path}.fallback`)
			});
		}
		case 'element': {
			requireExactKeys(node, ['kind', 'binding', 'value']);
			const binding = requireBinding(node.binding, bindings, `${path}.binding`);
			if (binding.kind !== 'element') throw new TypeError(`${path} requires an element binding`);
			return Object.freeze({
				kind: 'element',
				binding: binding.index,
				value: validatePattern(node.value, bindings, budget, depth + 1, `${path}.value`)
			});
		}
		case 'opaque': {
			requireExactKeys(node, ['kind', 'binding', 'name']);
			const binding = requireBinding(node.binding, bindings, `${path}.binding`);
			if (binding.kind !== 'opaque') throw new TypeError(`${path} requires an opaque binding`);
			return Object.freeze({
				kind: 'opaque',
				binding: binding.index,
				name: requireBoundedString(node.name, `${path}.name`)
			});
		}
		default:
			throw new TypeError(`${path} has unsupported node kind "${String(node.kind)}"`);
	}
}

/** Internal domain operation that validate structural usage without publishing an application API. */
export function validateStructuralUsage(
	pattern: IntlPatternV1,
	bindings: readonly IntlBindingDescriptorV1[],
	path: string
): void {
	for (const binding of bindings) {
		if (binding.kind !== 'element' && binding.kind !== 'opaque') continue;
		const counts = structuralUsageCounts(pattern, binding.index);
		if (counts.size !== 1 || !counts.has(1))
			throw new TypeError(`${path} must use structural binding ${binding.index} exactly once`);
	}
}

function structuralUsageCounts(pattern: IntlPatternV1, binding: number): Set<number> {
	let totals = new Set([0]);
	for (const node of pattern) {
		let nodeCounts = new Set([0]);
		if (node.kind === 'element') {
			nodeCounts = structuralUsageCounts(node.value, binding);
			if (node.binding === binding)
				nodeCounts = new Set([...nodeCounts].map((count) => Math.min(2, count + 1)));
		} else if (node.kind === 'opaque' && node.binding === binding) {
			nodeCounts = new Set([1]);
		} else if (node.kind === 'select') {
			nodeCounts = new Set<number>();
			for (const branch of [...node.cases.map((candidate) => candidate.value), node.fallback])
				for (const count of structuralUsageCounts(branch, binding)) nodeCounts.add(count);
		}
		const combined = new Set<number>();
		for (const left of totals)
			for (const right of nodeCounts) combined.add(Math.min(2, left + right));
		totals = combined;
	}
	return totals;
}
