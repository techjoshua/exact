import { exactLanguageProtocolLimits } from './limits.js';
import type { ExactLanguageDiagnosticSeverity } from './contracts.js';

/** Finite value vocabulary entry for one namespaced JSX attribute. */
export interface ExactDeclarativeValueV1 {
	readonly value: string;
	readonly description?: string;
	readonly deprecated?: boolean;
	readonly replacement?: string;
}

/** Declarative validation and assistance for one enhancement attribute. */
export interface ExactDeclarativeAttributeV1 {
	readonly name: string;
	readonly description: string;
	readonly documentation?: string;
	readonly valueKind?: 'boolean' | 'string' | 'nonempty-string' | 'id-token-list';
	readonly targets?: readonly string[];
	readonly values?: readonly ExactDeclarativeValueV1[];
	readonly requires?: readonly string[];
	readonly excludes?: readonly string[];
	readonly severity?: ExactLanguageDiagnosticSeverity;
}

/** One enhancement namespace described without executing package code. */
export interface ExactDeclarativeNamespaceV1 {
	readonly name: string;
	readonly description: string;
	readonly attributes: readonly ExactDeclarativeAttributeV1[];
}

/** Strict protocol-1 declarative contribution document. */
export interface ExactDeclarativeLanguageContributionV1 {
	readonly schemaVersion: 1;
	readonly provider: string;
	readonly capabilities: Readonly<{
		namespaces: readonly ExactDeclarativeNamespaceV1[];
	}>;
}

/** Parses a bounded declarative contribution after the host enforces its byte limit. */
export function parseExactDeclarativeLanguageContribution(
	value: unknown,
	expectedProvider?: string
): ExactDeclarativeLanguageContributionV1 {
	if (!isRecord(value)) throw new Error('Declarative language contribution must be an object');
	assertKeys(value, ['schemaVersion', 'provider', 'capabilities'], 'declarative contribution');
	if (value.schemaVersion !== 1)
		throw new Error('Declarative contribution schemaVersion must be 1');
	if (typeof value.provider !== 'string' || !value.provider)
		throw new Error('Declarative contribution provider must be a package name');
	if (expectedProvider && value.provider !== expectedProvider)
		throw new Error(`Declarative contribution provider must equal ${expectedProvider}`);
	if (!isRecord(value.capabilities))
		throw new Error('Declarative contribution capabilities must be an object');
	assertKeys(value.capabilities, ['namespaces'], 'declarative capabilities');
	if (!Array.isArray(value.capabilities.namespaces))
		throw new Error('Declarative contribution namespaces must be an array');
	const namespaces = value.capabilities.namespaces.map((entry, index) =>
		parseNamespace(entry, `namespaces[${index}]`)
	);
	const declarationCount = namespaces.reduce(
		(total, namespace) =>
			total +
			1 +
			namespace.attributes.reduce(
				(count, attribute) => count + 1 + (attribute.values?.length ?? 0),
				0
			),
		0
	);
	if (declarationCount > exactLanguageProtocolLimits.declarations)
		throw new Error('Declarative contribution exceeds the protocol declaration limit');
	unique(
		namespaces.map((namespace) => namespace.name),
		'namespace'
	);
	return Object.freeze({
		schemaVersion: 1,
		provider: value.provider,
		capabilities: Object.freeze({ namespaces: Object.freeze(namespaces) })
	});
}

function parseNamespace(value: unknown, field: string): ExactDeclarativeNamespaceV1 {
	if (!isRecord(value)) throw new Error(`${field} must be an object`);
	assertKeys(value, ['name', 'description', 'attributes'], field);
	const name = nonempty(value.name, `${field}.name`);
	const description = boundedText(value.description, `${field}.description`);
	if (!Array.isArray(value.attributes)) throw new Error(`${field}.attributes must be an array`);
	const attributes = value.attributes.map((entry, index) =>
		parseAttribute(entry, `${field}.attributes[${index}]`)
	);
	unique(
		attributes.map((attribute) => attribute.name),
		`${field} attribute`
	);
	validateAttributeGraph(attributes, field);
	return Object.freeze({ name, description, attributes: Object.freeze(attributes) });
}

function validateAttributeGraph(
	attributes: readonly ExactDeclarativeAttributeV1[],
	field: string
): void {
	const names = new Set(attributes.map((attribute) => attribute.name));
	let edges = 0;
	for (const attribute of attributes) {
		for (const related of [...(attribute.requires ?? []), ...(attribute.excludes ?? [])]) {
			edges++;
			if (!names.has(related))
				throw new Error(`${field}.${attribute.name} references unknown attribute ${related}`);
			if (related === attribute.name)
				throw new Error(`${field}.${attribute.name} must not reference itself`);
		}
		const values = new Set(attribute.values?.map((value) => value.value) ?? []);
		for (const value of attribute.values ?? [])
			if (value.replacement && !values.has(value.replacement))
				throw new Error(
					`${field}.${attribute.name} references unknown replacement ${value.replacement}`
				);
	}
	if (edges > exactLanguageProtocolLimits.graphEdges)
		throw new Error(`${field} exceeds the protocol graph-edge limit`);
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (name: string): void => {
		if (visiting.has(name)) throw new Error(`${field} contains a cyclic requires relationship`);
		if (visited.has(name)) return;
		visiting.add(name);
		const attribute = attributes.find((candidate) => candidate.name === name)!;
		for (const required of attribute.requires ?? []) visit(required);
		visiting.delete(name);
		visited.add(name);
	};
	for (const attribute of attributes) visit(attribute.name);
}

function parseAttribute(value: unknown, field: string): ExactDeclarativeAttributeV1 {
	if (!isRecord(value)) throw new Error(`${field} must be an object`);
	assertKeys(
		value,
		[
			'name',
			'description',
			'documentation',
			'valueKind',
			'targets',
			'values',
			'requires',
			'excludes',
			'severity'
		],
		field
	);
	const name = nonempty(value.name, `${field}.name`);
	const values =
		value.values === undefined ? undefined : parseValues(value.values, `${field}.values`);
	const valueKinds = new Set(['boolean', 'string', 'nonempty-string', 'id-token-list']);
	if (value.valueKind !== undefined && !valueKinds.has(String(value.valueKind)))
		throw new Error(`${field}.valueKind is unsupported`);
	const severities = new Set(['error', 'warning', 'information', 'hint']);
	if (value.severity !== undefined && !severities.has(String(value.severity)))
		throw new Error(`${field}.severity is unsupported`);
	return Object.freeze({
		name,
		description: boundedText(value.description, `${field}.description`),
		...(value.documentation === undefined
			? {}
			: { documentation: nonempty(value.documentation, `${field}.documentation`) }),
		...(value.valueKind === undefined
			? {}
			: { valueKind: value.valueKind as ExactDeclarativeAttributeV1['valueKind'] }),
		...(value.targets === undefined
			? {}
			: { targets: stringList(value.targets, `${field}.targets`) }),
		...(values ? { values } : {}),
		...(value.requires === undefined
			? {}
			: { requires: stringList(value.requires, `${field}.requires`) }),
		...(value.excludes === undefined
			? {}
			: { excludes: stringList(value.excludes, `${field}.excludes`) }),
		...(value.severity === undefined
			? {}
			: { severity: value.severity as ExactLanguageDiagnosticSeverity })
	});
}

function parseValues(value: unknown, field: string): readonly ExactDeclarativeValueV1[] {
	if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
	const values = value.map((entry, index) => {
		const item = `${field}[${index}]`;
		if (!isRecord(entry)) throw new Error(`${item} must be an object`);
		assertKeys(entry, ['value', 'description', 'deprecated', 'replacement'], item);
		return Object.freeze({
			value: nonempty(entry.value, `${item}.value`),
			...(entry.description === undefined
				? {}
				: { description: boundedText(entry.description, `${item}.description`) }),
			...(entry.deprecated === undefined ? {} : { deprecated: entry.deprecated === true }),
			...(entry.replacement === undefined
				? {}
				: { replacement: nonempty(entry.replacement, `${item}.replacement`) })
		});
	});
	unique(
		values.map((entry) => entry.value),
		`${field} value`
	);
	return Object.freeze(values);
}

function stringList(value: unknown, field: string): readonly string[] {
	if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
	const values = value.map((entry, index) => nonempty(entry, `${field}[${index}]`));
	unique(values, field);
	return Object.freeze(values);
}

function boundedText(value: unknown, field: string): string {
	const text = nonempty(value, field);
	if (new TextEncoder().encode(text).length > exactLanguageProtocolLimits.messageBytes)
		throw new Error(`${field} exceeds the protocol message limit`);
	return text;
}

function nonempty(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim())
		throw new Error(`${field} must be a nonempty string`);
	return value;
}

function unique(values: readonly string[], field: string): void {
	if (new Set(values).size !== values.length) throw new Error(`${field} values must be unique`);
}

function assertKeys(value: Record<string, unknown>, keys: readonly string[], field: string): void {
	const allowed = new Set(keys);
	for (const key of Object.keys(value))
		if (!allowed.has(key)) throw new Error(`${field}.${key} is unknown`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
