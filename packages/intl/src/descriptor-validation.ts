import type {
	IntlBindingDescriptorV1,
	IntlCatalogV1,
	IntlPatternV1,
	IntlPropertyName,
	IntlRuntimeDescriptorV1,
	IntlTranslationPatternNodeV1,
	IntlTranslationPatternV1
} from './contracts.js';
import { materializeIntlTranslation } from './translation-contract.js';
import {
	validatePattern,
	validateStructuralUsage,
	validationBudget
} from './pattern-validation.js';
import {
	canonicalLocale,
	requireBoundedString,
	requireExactKeys,
	requireRecord
} from './validation-primitives.js';

const propertyNames = new Set<IntlPropertyName>([
	'alt',
	'title',
	'placeholder',
	'aria-label',
	'aria-description',
	'aria-roledescription',
	'aria-valuetext'
]);
const bindingTypes = new Set([
	'string',
	'number',
	'bigint',
	'boolean',
	'temporal-date',
	'temporal-time',
	'temporal-date-time',
	'temporal-instant',
	'temporal-zoned-date-time',
	'temporal-duration',
	'monetary',
	'measurement',
	'structure',
	'opaque-structure'
]);
/** Limits recursive validation work for untrusted descriptors and catalogs. */
export interface IntlValidationLimits {
	readonly maxDepth?: number;
	readonly maxNodes?: number;
	readonly maxTextLength?: number;
}

/** Validates and freezes one runtime descriptor before publication. */
export function validateIntlRuntimeDescriptor(
	input: unknown,
	limits: IntlValidationLimits = {}
): IntlRuntimeDescriptorV1 {
	const record = requireRecord(input, 'descriptor');
	requireExactKeys(
		record,
		[
			'protocol',
			'owner',
			'occurrenceId',
			'contract',
			'key',
			'name',
			'sourceLocale',
			'target',
			'bindings',
			'source',
			'capabilities'
		],
		['name']
	);
	if (record.protocol !== 1) throw new TypeError('Intl descriptor protocol must be 1');
	const owner = requireBoundedString(record.owner, 'descriptor.owner');
	const occurrenceId = requireBoundedString(record.occurrenceId, 'descriptor.occurrenceId');
	const contract = requireContractHash(record.contract, 'descriptor.contract');
	const key = requireBoundedString(record.key, 'descriptor.key');
	if (!validMessageKey(key)) throw new TypeError(`Invalid intl message key "${key}"`);
	const name =
		record.name === undefined ? undefined : requireBoundedString(record.name, 'descriptor.name');
	const sourceLocale = canonicalLocale(record.sourceLocale, 'descriptor.sourceLocale');
	const target = validateTarget(record.target);
	if (!Array.isArray(record.bindings)) throw new TypeError('descriptor.bindings must be an array');
	const bindings = Object.freeze(
		record.bindings.map((binding, index) => validateBinding(binding, index))
	);
	const budget = validationBudget(limits);
	const source = validatePattern(record.source, bindings, budget, 0, 'descriptor.source');
	validateStructuralUsage(source, bindings, 'descriptor.source');
	if (!Array.isArray(record.capabilities))
		throw new TypeError('descriptor.capabilities must be an array');
	const capabilities = Object.freeze(
		record.capabilities.map((capability, index) =>
			requireBoundedString(capability, `descriptor.capabilities[${index}]`)
		)
	);
	const derivedCapabilities = [...patternCapabilities(source)].sort();
	for (const capability of derivedCapabilities)
		if (!capabilities.includes(capability))
			throw new TypeError(`descriptor.capabilities omits source capability ${capability}`);
	return Object.freeze({
		protocol: 1,
		owner,
		occurrenceId,
		contract,
		key,
		...(name ? { name } : {}),
		sourceLocale,
		target,
		bindings,
		source,
		capabilities
	});
}

/** Validates a locale catalog against its package-owned runtime descriptors. */
export function validateIntlCatalog(
	input: unknown,
	descriptors: readonly IntlRuntimeDescriptorV1[],
	limits: IntlValidationLimits = {}
): IntlCatalogV1 {
	const record = requireRecord(input, 'catalog');
	requireExactKeys(record, ['protocol', 'locale', 'owner', 'messages']);
	if (record.protocol !== 1) throw new TypeError('Intl catalog protocol must be 1');
	const locale = canonicalLocale(record.locale, 'catalog.locale');
	const owner = requireBoundedString(record.owner, 'catalog.owner');
	const messagesRecord = requireRecord(record.messages, 'catalog.messages');
	const contracts = new Map<string, IntlRuntimeDescriptorV1[]>();
	for (const descriptor of descriptors)
		if (descriptor.owner === owner) {
			const group = contracts.get(descriptor.key) ?? [];
			group.push(descriptor);
			contracts.set(descriptor.key, group);
		}
	const messages: Record<string, IntlTranslationPatternV1> = Object.create(null) as Record<
		string,
		IntlTranslationPatternV1
	>;
	for (const key of Object.keys(messagesRecord).sort()) {
		const descriptorGroup = contracts.get(key);
		if (!descriptorGroup?.length)
			throw new TypeError(`Catalog contains unknown message ${owner}:${key}`);
		const rawMessage = messagesRecord[key];
		const translation = validateTranslationPattern(rawMessage, `catalog.messages.${key}`, limits);
		for (const descriptor of descriptorGroup) {
			const pattern = materializeIntlTranslation(translation, descriptor);
			validatePattern(
				pattern,
				descriptor.bindings,
				validationBudget(limits),
				0,
				`catalog.messages.${key}`
			);
			validateStructuralUsage(pattern, descriptor.bindings, `catalog.messages.${key}`);
		}
		messages[key] = translation;
	}
	return Object.freeze({ protocol: 1, locale, owner, messages: Object.freeze(messages) });
}

function validateTranslationPattern(
	input: unknown,
	path: string,
	limits: IntlValidationLimits
): IntlTranslationPatternV1 {
	const maximumDepth = limits.maxDepth ?? 32;
	const maximumNodes = limits.maxNodes ?? 10_000;
	const maximumTextLength = limits.maxTextLength ?? 1_000_000;
	let nodes = 0;
	let textLength = 0;
	const visit = (value: unknown, currentPath: string, depth: number): IntlTranslationPatternV1 => {
		if (!Array.isArray(value)) throw new TypeError(`${currentPath} must be an array`);
		if (depth > maximumDepth) throw new TypeError(`${path} exceeds the translation depth limit`);
		return Object.freeze(
			value.map((inputNode, index): IntlTranslationPatternNodeV1 => {
				nodes++;
				if (nodes > maximumNodes) throw new TypeError(`${path} exceeds the translation node limit`);
				const node = requireRecord(inputNode, `${currentPath}[${index}]`);
				if (node.kind === 'text') {
					requireExactKeys(node, ['kind', 'value']);
					const text = requireBoundedString(node.value, `${currentPath}[${index}].value`);
					textLength += text.length;
					if (textLength > maximumTextLength)
						throw new TypeError(`${path} exceeds the translation text limit`);
					return Object.freeze({ kind: 'text', value: text });
				}
				const id = requireBoundedString(node.id, `${currentPath}[${index}].id`);
				if (node.kind === 'placeholder') {
					requireExactKeys(node, ['kind', 'id']);
					return Object.freeze({ kind: 'placeholder', id });
				}
				if (node.kind === 'element') {
					requireExactKeys(node, ['kind', 'id', 'value']);
					return Object.freeze({
						kind: 'element',
						id,
						value: visit(node.value, `${currentPath}[${index}].value`, depth + 1)
					});
				}
				if (node.kind !== 'select')
					throw new TypeError(`${currentPath}[${index}] has an unsupported translation kind`);
				requireExactKeys(node, ['kind', 'id', 'cases', 'fallback']);
				if (!Array.isArray(node.cases))
					throw new TypeError(`${currentPath}[${index}].cases must be an array`);
				const seen = new Set<string>();
				const cases = Object.freeze(
					node.cases.map((inputCase, caseIndex) => {
						const candidate = requireRecord(
							inputCase,
							`${currentPath}[${index}].cases[${caseIndex}]`
						);
						requireExactKeys(candidate, ['key', 'value']);
						const key = requireBoundedString(
							candidate.key,
							`${currentPath}[${index}].cases[${caseIndex}].key`
						);
						if (seen.has(key)) throw new TypeError(`Intl selector ${id} repeats case ${key}`);
						seen.add(key);
						return Object.freeze({
							key,
							value: visit(
								candidate.value,
								`${currentPath}[${index}].cases[${caseIndex}].value`,
								depth + 1
							)
						});
					})
				);
				return Object.freeze({
					kind: 'select',
					id,
					cases,
					fallback: visit(node.fallback, `${currentPath}[${index}].fallback`, depth + 1)
				});
			})
		);
	};
	return visit(input, path, 0);
}

function requireContractHash(input: unknown, path: string): string {
	const value = requireBoundedString(input, path);
	if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) throw new TypeError(`${path} must be a SHA-256 hash`);
	return value;
}

function validMessageKey(value: string): boolean {
	return /^(?:[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}_)?[A-Za-z0-9_-]{43}$/u.test(value);
}

function patternCapabilities(pattern: IntlPatternV1): ReadonlySet<string> {
	const capabilities = new Set<string>();
	const visit = (nodes: IntlPatternV1): void => {
		for (const node of nodes) {
			if (node.kind === 'format') capabilities.add(node.formatter.kind);
			else if (node.kind === 'select') {
				capabilities.add(node.selection);
				for (const candidate of node.cases) visit(candidate.value);
				visit(node.fallback);
			} else if (node.kind === 'element') {
				capabilities.add('element');
				visit(node.value);
			} else if (node.kind === 'opaque') capabilities.add('opaque');
		}
	};
	visit(pattern);
	return capabilities;
}

function validateTarget(input: unknown): IntlRuntimeDescriptorV1['target'] {
	const target = requireRecord(input, 'descriptor.target');
	if (target.kind === 'content') {
		requireExactKeys(target, ['kind']);
		return Object.freeze({ kind: 'content' });
	}
	if (target.kind !== 'property') throw new TypeError('Intl descriptor target is not supported');
	requireExactKeys(target, ['kind', 'name']);
	if (!propertyNames.has(target.name as IntlPropertyName))
		throw new TypeError(`Unsupported intl property target "${String(target.name)}"`);
	return Object.freeze({ kind: 'property', name: target.name as IntlPropertyName });
}

function validateBinding(input: unknown, index: number): IntlBindingDescriptorV1 {
	const binding = requireRecord(input, `descriptor.bindings[${index}]`);
	requireExactKeys(
		binding,
		['index', 'kind', 'type', 'name', 'exactlyOnce'],
		['name', 'exactlyOnce']
	);
	if (binding.index !== index)
		throw new TypeError('Intl binding indexes must be dense and ordered');
	if (!['value', 'selector', 'element', 'opaque'].includes(String(binding.kind)))
		throw new TypeError(`Unsupported intl binding kind "${String(binding.kind)}"`);
	if (typeof binding.type !== 'string' || !bindingTypes.has(binding.type))
		throw new TypeError(`Unsupported intl binding type "${String(binding.type)}"`);
	if (binding.kind === 'element' && binding.type !== 'structure')
		throw new TypeError('Intl element bindings require structure type');
	if (binding.kind === 'opaque' && binding.type !== 'opaque-structure')
		throw new TypeError('Intl opaque bindings require opaque-structure type');
	if ((binding.kind === 'element' || binding.kind === 'opaque') && binding.exactlyOnce !== true)
		throw new TypeError('Intl structural bindings must be exactly once');
	return Object.freeze({
		index,
		kind: binding.kind as IntlBindingDescriptorV1['kind'],
		type: binding.type as IntlBindingDescriptorV1['type'],
		...(binding.name === undefined
			? {}
			: { name: requireBoundedString(binding.name, `descriptor.bindings[${index}].name`) }),
		...(binding.exactlyOnce === true ? { exactlyOnce: true as const } : {})
	});
}
